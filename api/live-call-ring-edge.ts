import { WebSocket } from 'ws'
import { firstValueFrom, fromEvent, interval, ReplaySubject } from 'rxjs'
import { PeerConnection } from './peer-connection'
import { logDebug, logError, logInfo } from './util'
import { RingCamera } from './ring-camera'
import { concatMap, filter, switchMap } from 'rxjs/operators'
import { Subscribed } from './subscribed'
import {
  FfmpegProcess,
  reservePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { getFfmpegPath } from './ffmpeg'
import { RtpPacket } from '@koush/werift'

interface SessionBody {
  doorbot_id: number
  session_id: string
}

interface AnswerMessage {
  method: 'sdp'
  body: {
    sdp: string
    type: 'answer'
  } & SessionBody
}

interface IceCandidateMessage {
  method: 'ice'
  body: {
    ice: string
    mlineindex: number
  } & SessionBody
}

interface SessionCreatedMessage {
  method: 'session_created'
  body: SessionBody
}

interface SessionStartedMessage {
  method: 'session_started'
  body: SessionBody
}

interface PongMessage {
  method: 'pong'
  body: SessionBody
}

interface NotificationMessage {
  method: 'notification'
  body: {
    is_ok: boolean
    text: string
  } & SessionBody
}

// eslint-disable-next-line no-shadow
enum CloseReasonCode {
  NormalClose = 0,
  // reason: { code: 5, text: '[rsl-apps/webrtc-liveview-server/Session.cpp:429] [Auth] [0xd540]: [rsl-apps/session-manager/Manager.cpp:227] [AppAuth] Unauthorized: invalid or expired token' }
  // reason: { code: 5, text: 'Authentication failed: -1' }
  // reason: { code: 5, text: 'Sessions with the provided ID not found' }
  AuthenticationFailed = 5,
  // reason: { code: 6, text: 'Timeout waiting for ping' }
  Timeout = 6,
}

interface CloseMessage {
  method: 'close'
  body: {
    reason: { code: CloseReasonCode; text: string }
  } & SessionBody
}

type IncomingMessage =
  | AnswerMessage
  | IceCandidateMessage
  | SessionCreatedMessage
  | SessionStartedMessage
  | PongMessage
  | CloseMessage
  | NotificationMessage

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

function getCleanSdp(sdp: string, includeVideo: boolean) {
  return sdp
    .split('\nm=')
    .slice(1)
    .map((section) => 'm=' + section)
    .filter((section) => includeVideo || !section.startsWith('m=video'))
    .join('\n')
}

export class LiveCallRingEdge extends Subscribed {
  private readonly ws
  private readonly onWsOpen
  private readonly onMessage
  private readonly pc
  readonly onSessionId = new ReplaySubject<string>(1)
  readonly onCallAnswered = new ReplaySubject<string>(1)
  readonly onCallEnded = new ReplaySubject<void>(1)

  private readonly audioSplitter = new RtpSplitter()
  private readonly videoSplitter = new RtpSplitter()
  readonly onVideoRtp
  readonly onAudioRtp
  private readonly onOfferSent = new ReplaySubject<void>(1)

  constructor(authToken: string, private camera: RingCamera) {
    super()

    this.pc = new PeerConnection()
    this.ws = new WebSocket(
      'wss://api.prod.signalling.ring.devices.a2z.com:443/ws',
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-Sig-API-Version': '4.0',
          'X-Sig-Client-ID': 'ring_android-aabb123', // required but value doesn't matter
          'X-Sig-Client-Info':
            'Ring/3.49.0;Platform/Android;OS/7.0;Density/2.0;Device/samsung-SM-T710;Locale/en-US;TimeZone/GMT-07:00',
          'X-Sig-Auth-Type': 'ring_oauth',
        },
      }
    )

    this.onAudioRtp = this.pc.onAudioRtp
    this.onVideoRtp = this.pc.onVideoRtp

    this.onMessage = fromEvent(this.ws, 'message')
    this.onWsOpen = fromEvent(this.ws, 'open')
    const onError = fromEvent(this.ws, 'error'),
      onClose = fromEvent(this.ws, 'close')
    this.addSubscriptions(
      this.onMessage
        .pipe(
          concatMap((message) => {
            return this.handleMessage(
              JSON.parse((message as MessageEvent).data)
            )
          })
        )
        .subscribe(),

      this.onWsOpen.subscribe(() => {
        logDebug(`WebSocket connected for ${this.camera.name} (Ring Edge)`)
        this.initiateCall().catch((e) => {
          logError(e)
          this.callEnded()
        })
      }),

      onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      onClose.subscribe(() => {
        this.callEnded()
      }),

      this.onCallAnswered
        .pipe(switchMap(() => interval(5000)))
        .subscribe(() => {
          if (!this.sessionId) {
            return
          }

          this.sendSessionMessage('ping')
        }),

      this.pc.onIceCandidate.subscribe(async (iceCandidate) => {
        await firstValueFrom(this.onOfferSent)
        this.sendMessage({
          method: 'ice',
          body: {
            doorbot_id: this.camera.id,
            ice: iceCandidate.candidate,
            mlineindex: 0,
          },
        })
        // HACK: send ice candidate with both mline indexes to convince ring edge to connect both audio and video
        // Without this, only audio will connect unless you connect from the network of the Ring Edge router
        this.sendMessage({
          method: 'ice',
          body: {
            doorbot_id: this.camera.id,
            ice: iceCandidate.candidate,
            mlineindex: 1,
          },
        })
      }),

      this.pc.onConnectionState.subscribe((state) => {
        if (state === 'failed') {
          logError('Stream connection failed')
          this.callEnded()
        }

        if (state === 'closed') {
          logDebug('Stream connection closed')
          this.callEnded()
        }
      })
    )
  }

  private async initiateCall() {
    const offer = await this.pc.createOffer()
    offer.sdp = offer.sdp.replace('\na=group:BUNDLE 0 1', '')

    this.sendMessage({
      method: 'live_view',
      body: {
        doorbot_id: this.camera.id,
        stream_options: { audio_enabled: true, video_enabled: true },
        sdp: offer.sdp,
      },
    })

    this.onOfferSent.next()
  }

  private sessionId: string | null = null
  private async handleMessage(message: IncomingMessage) {
    if (message.body.doorbot_id !== this.camera.id) {
      // ignore messages for other cameras
      return
    }

    if (
      ['session_created', 'session_started'].includes(message.method) &&
      'session_id' in message.body &&
      !this.sessionId
    ) {
      this.sessionId = message.body.session_id
      this.onSessionId.next(this.sessionId)
    }

    if (message.body.session_id && message.body.session_id !== this.sessionId) {
      // ignore messages for other sessions
      return
    }

    switch (message.method) {
      case 'session_created':
      case 'session_started':
        // session already stored above
        return
      case 'sdp':
        await this.pc.acceptAnswer(message.body)
        this.onCallAnswered.next(message.body.sdp)
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.body.ice,
          sdpMLineIndex: message.body.mlineindex,
        })
        return
      case 'pong':
        return
      case 'close':
        logError('Video stream closed')
        logError(message.body)
        this.callEnded()
        return
    }

    logError('UNKNOWN MESSAGE')
    logError(message)
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts({ count: bufferPorts + 1 })
    return ports[0]
  }

  async startTranscoding(ffmpegOptions: FfmpegOptions) {
    const videoPort = await this.reservePort(1),
      audioPort = await this.reservePort(1),
      transcodeVideoStream = ffmpegOptions.video !== false,
      ffmpegInputArguments = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-acodec',
        'libopus',
        '-f',
        'sdp',
        ...(ffmpegOptions.input || []),
        '-i',
        'pipe:',
      ],
      ringSdp = await firstValueFrom(this.onCallAnswered),
      inputSdp = getCleanSdp(ringSdp, transcodeVideoStream)
        .replace(/m=audio \d+/, `m=audio ${audioPort}`)
        .replace(/m=video \d+/, `m=video ${videoPort}`),
      ff = new FfmpegProcess({
        ffmpegArgs: ffmpegInputArguments.concat(
          ...(ffmpegOptions.audio || ['-acodec', 'aac']),
          ...(transcodeVideoStream
            ? ffmpegOptions.video || ['-vcodec', 'copy']
            : []),
          ...(ffmpegOptions.output || [])
        ),
        ffmpegPath: getFfmpegPath(),
        exitCallback: () => this.callEnded(),
        logLabel: `From Ring (${this.camera.name})`,
        logger: {
          error: logError,
          info: logDebug,
        },
      })

    this.addSubscriptions(
      this.onAudioRtp
        .pipe(
          concatMap((rtp) => {
            return this.audioSplitter.send(rtp.serialize(), {
              port: audioPort,
            })
          })
        )
        .subscribe()
    )

    if (transcodeVideoStream) {
      this.addSubscriptions(
        this.onVideoRtp
          .pipe(
            concatMap((rtp) => {
              return this.videoSplitter.send(rtp.serialize(), {
                port: videoPort,
              })
            })
          )
          .subscribe()
      )
    }

    this.onCallEnded.subscribe(() => ff.stop())

    ff.writeStdin(inputSdp)

    // Activate the stream now that ffmpeg is ready to receive
    await this.activate()
  }

  activated = false
  async activate() {
    if (this.activated) {
      return
    }
    this.activated = true
    await firstValueFrom(
      this.pc.onConnectionState.pipe(filter((state) => state === 'connected'))
    )

    logInfo('Activating Session')
    this.sendSessionMessage('activate_session')
  }

  async activateCameraSpeaker() {
    await firstValueFrom(this.onCallAnswered)
    this.sendSessionMessage('camera_options', {
      stealth_mode: false,
    })
  }

  private sendSessionMessage(method: string, body: Record<any, any> = {}) {
    const message = {
      method,
      body: {
        ...body,
        doorbot_id: this.camera.id,
        session_id: this.sessionId,
      },
    }

    if (this.sessionId) {
      // Send immediately if we already have a session id
      // This is needed to send `close` before closing the websocket
      this.sendMessage(message)
    } else {
      firstValueFrom(this.onSessionId)
        .then(() => this.sendMessage(message))
        .catch((e) => logError(e))
    }
  }

  private sendMessage(message: Record<any, any>) {
    this.ws.send(JSON.stringify(message))
  }

  private callEnded() {
    try {
      this.sendSessionMessage('close', {
        reason: { code: CloseReasonCode.NormalClose, text: '' },
      })
      this.ws.close()
    } catch (_) {
      // ignore any errors since we are stopping the call
    }

    this.unsubscribe()
    this.onCallEnded.next()
    this.pc.close()
    this.audioSplitter.close()
    this.videoSplitter.close()
  }

  stop() {
    this.callEnded()
  }

  sendAudioPacket(rtp: RtpPacket) {
    this.pc.returnAudioTrack.writeRtp(rtp)
  }
}
