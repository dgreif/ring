import { WebSocket } from 'ws'
import {
  firstValueFrom,
  fromEvent,
  interval,
  ReplaySubject,
  Subject,
} from 'rxjs'
import { concatMap } from 'rxjs/operators'
import { logDebug, logError, logInfo } from '../util'
import { RingCamera } from '../ring-camera'
import crypto from 'crypto'
import { BasicPeerConnection, WeriftPeerConnection } from './peer-connection'
import { Subscribed } from '../subscribed'
import { RtpPacket } from 'werift'
import { IncomingMessage } from './streaming-messages'

export interface StreamingConnectionOptions {
  createPeerConnection?: () => BasicPeerConnection
}

export class WebrtcConnection extends Subscribed {
  private readonly onSessionId = new ReplaySubject<string>(1)
  private readonly onOfferSent = new ReplaySubject<void>(1)
  private readonly dialogId = crypto.randomUUID()
  readonly onCallAnswered = new ReplaySubject<string>(1)
  readonly onCallEnded = new ReplaySubject<void>(1)
  readonly onError = new ReplaySubject<void>(1)
  readonly onMessage = new ReplaySubject<{ method: string }>()
  readonly onWsOpen
  readonly onAudioRtp
  readonly onVideoRtp
  private readonly pc
  private readonly ws

  constructor(
    ticket: string,
    private camera: RingCamera,
    options: StreamingConnectionOptions
  ) {
    super()
    this.ws = new WebSocket(
      `wss://api.prod.signalling.ring.devices.a2z.com:443/ws?api_version=4.0&auth_type=ring_solutions&client_id=ring_site-${crypto.randomUUID()}&token=${ticket}`,
      {
        headers: {
          // This must exist or the socket will close immediately but content does not seem to matter
          'User-Agent': 'android:com.ringapp',
        },
      }
    )

    if (options.createPeerConnection) {
      // we were passed a custom peer connection factory
      this.pc = options.createPeerConnection()

      // passing rtp packets is not supported for custom peer connections
      this.onAudioRtp = new Subject<RtpPacket>()
      this.onVideoRtp = new Subject<RtpPacket>()
    } else {
      // no custom peer connection factory, use the werift and pass along rtp packets
      const pc = new WeriftPeerConnection()
      this.pc = pc
      this.onAudioRtp = pc.onAudioRtp
      this.onVideoRtp = pc.onVideoRtp
    }

    this.onWsOpen = fromEvent(this.ws, 'open')
    const onMessage = fromEvent(this.ws, 'message'),
      onError = fromEvent(this.ws, 'error'),
      onClose = fromEvent(this.ws, 'close')

    this.addSubscriptions(
      onMessage
        .pipe(
          concatMap((event) => {
            const message = JSON.parse((event as MessageEvent).data)
            this.onMessage.next(message)
            return this.handleMessage(message).catch((e) => {
              if (
                e instanceof Error &&
                e.message.includes('negotiate codecs failed')
              ) {
                e = new Error(
                  'Failed to negotiate codecs.  This is a known issue with Ring cameras.  Please see https://github.com/dgreif/ring/wiki/Streaming-Legacy-Mode'
                )
              }
              this.onError.next(e)
              throw e
            })
          })
        )
        .subscribe(),

      onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      onClose.subscribe(() => {
        this.callEnded()
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
      }),

      this.onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      this.onWsOpen.subscribe(() => {
        logDebug(`WebSocket connected for ${camera.name}`)
        this.initiateCall().catch((e) => {
          logError(e)
          this.callEnded()
        })
      }),

      // The ring-edge session needs a ping every 5 seconds to keep the connection alive
      interval(5000).subscribe(() => {
        this.sendSessionMessage('ping')
      }),

      this.pc.onIceCandidate.subscribe(async (iceCandidate) => {
        await firstValueFrom(this.onOfferSent)
        this.sendMessage({
          method: 'ice',
          dialog_id: this.dialogId,
          body: {
            doorbot_id: camera.id,
            ice: iceCandidate.candidate,
            mlineindex: iceCandidate.sdpMLineIndex,
          },
        })
      })
    )
  }

  private async initiateCall() {
    const { sdp } = await this.pc.createOffer()

    this.sendMessage({
      method: 'live_view',
      dialog_id: this.dialogId,
      body: {
        doorbot_id: this.camera.id,
        stream_options: { audio_enabled: true, video_enabled: true },
        sdp,
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

        this.activate()
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.body.ice,
          sdpMLineIndex: message.body.mlineindex,
        })
        return
      case 'pong':
        return
      case 'notification':
        const { text } = message.body
        if (
          text === 'PeerConnectionState::kConnecting' ||
          text === 'PeerConnectionState::kConnected'
        ) {
          return
        }
        break
      case 'close':
        logError('Video stream closed')
        logError(message.body)
        this.callEnded()
        return
    }

    logError('UNKNOWN MESSAGE')
    logError(message)
  }

  private sendSessionMessage(method: string, body: Record<any, any> = {}) {
    const sendSessionMessage = () => {
      const message = {
        method,
        dialog_id: this.dialogId,
        body: {
          ...body,
          doorbot_id: this.camera.id,
          session_id: this.sessionId,
        },
      }
      this.sendMessage(message)
    }

    if (this.sessionId) {
      // Send immediately if we already have a session id
      // This is needed to send `close` before closing the websocket
      sendSessionMessage()
    } else {
      firstValueFrom(this.onSessionId)
        .then(sendSessionMessage)
        .catch((e) => logError(e))
    }
  }

  private sendMessage(message: Record<any, any>) {
    if (this.hasEnded) {
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  sendAudioPacket(rtp: RtpPacket) {
    if (this.hasEnded) {
      return
    }

    if (this.pc instanceof WeriftPeerConnection) {
      this.pc.returnAudioTrack.writeRtp(rtp)
    } else {
      throw new Error(
        'Cannot send audio packets to a custom peer connection implementation'
      )
    }
  }

  private activate() {
    logInfo('Activating Session')
    // the activate_session message is required to keep the stream alive longer than 70 seconds
    this.sendSessionMessage('activate_session')
    this.sendSessionMessage('stream_options', {
      audio_enabled: true,
      video_enabled: true,
    })
  }

  activateCameraSpeaker() {
    // Fire and forget this call so that callers don't get hung up waiting for answer (which might not happen)
    firstValueFrom(this.onCallAnswered)
      .then(() => {
        this.sendSessionMessage('camera_options', {
          stealth_mode: false,
        })
      })
      .catch((e) => {
        logError(e)
      })
  }

  private hasEnded = false
  private callEnded() {
    if (this.hasEnded) {
      return
    }

    try {
      this.sendMessage({
        reason: { code: 0, text: '' },
        method: 'close',
      })
      this.ws.close()
    } catch (_) {
      // ignore any errors since we are stopping the call
    }
    this.hasEnded = true

    this.unsubscribe()
    this.onCallEnded.next()
    this.pc.close()
  }

  stop() {
    this.callEnded()
  }

  requestKeyFrame() {
    this.pc.requestKeyFrame?.()
  }
}
