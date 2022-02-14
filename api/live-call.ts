import { parseLiveCallSession } from './rtp-utils'
import { WebSocket } from 'ws'
import { firstValueFrom, fromEvent, ReplaySubject } from 'rxjs'
import { PeerConnection } from './peer-connection'
import { logDebug, logError } from './util'
import { RingCamera } from './ring-camera'
import { concatMap } from 'rxjs/operators'
import { Subscribed } from './subscribed'
import {
  FfmpegProcess,
  reservePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { getFfmpegPath } from './ffmpeg'
import { RtpPacket } from '@koush/werift'

interface InitializationMessage {
  method: 'initialization'
  text: 'Done'
}

interface OfferMessage {
  method: 'sdp'
  sdp: string
  type: 'offer'
}

interface IceCandidateMessage {
  method: 'ice'
  ice: string
  mlineindex: number
}

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

export class LiveCall extends Subscribed {
  private readonly ws
  private readonly onWsOpen
  private readonly onMessage
  private readonly pc
  readonly onCallAnswered = new ReplaySubject<void>(1)
  readonly onCallEnded = new ReplaySubject<void>(1)

  private readonly audioSplitter = new RtpSplitter()
  private readonly videoSplitter = new RtpSplitter()
  readonly onVideoRtp
  readonly onAudioRtp

  constructor(private sessionId: string, private camera: RingCamera) {
    super()

    const liveCallSession = parseLiveCallSession(sessionId)
    this.pc = new PeerConnection()
    this.ws = new WebSocket(
      `wss://${liveCallSession.rms_fqdn}:${liveCallSession.webrtc_port}/`,
      {
        headers: {
          API_VERSION: '3.1',
          API_TOKEN: sessionId,
          CLIENT_INFO:
            'Ring/3.48.0;Platform/Android;OS/7.0;Density/2.0;Device/samsung-SM-T710;Locale/en-US;TimeZone/GMT-07:00',
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
        logDebug(`WebSocket connected for ${this.camera.name}`)
      }),

      onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      onClose.subscribe(() => {
        this.callEnded()
      })
    )
  }

  private async handleMessage(
    message: InitializationMessage | OfferMessage | IceCandidateMessage
  ) {
    switch (message.method) {
      case 'sdp':
        const answer = await this.pc.createAnswer(message)

        this.sendMessage({
          method: 'sdp',
          ...answer,
        })

        this.onCallAnswered.next()
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.ice,
          sdpMLineIndex: message.mlineindex,
        })
        return
    }
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts({ count: bufferPorts + 1 })
    return ports[0]
  }

  public prepareTranscoder(
    transcodeVideoStream: boolean,
    ffmpegInputOptions: SpawnInput[] | undefined,
    audioPort: number,
    videoPort: number,
    sdpInput: string
  ) {
    const ffmpegInputArguments = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-acodec',
        'libopus',
        '-f',
        'sdp',
        ...(ffmpegInputOptions || []),
        '-i',
        sdpInput,
      ],
      inputSdpLines = [
        'v=0',
        'o=105202070 3747 461 IN IP4 127.0.0.1',
        's=Talk',
        'c=IN IP4 127.0.0.1',
        'b=AS:380',
        't=0 0',
        'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',
        `m=audio ${audioPort} RTP/SAVP 101`,
        'a=rtpmap:101 OPUS/48000/2',
        'a=rtcp-fb:101 nack pli',
        'a=fmtp:101 useinbandfec=1;sprop-stereo=0',
        'a=rtcp-mux',
      ]

    if (transcodeVideoStream) {
      inputSdpLines.push(
        `m=video ${videoPort} RTP/SAVP 96`,
        'a=rtpmap:96 H264/90000',
        'a=rtcp-fb:96 nack',
        'a=rtcp-fb:96 nack pli',
        'a=fmtp:96 packetization-mode=1;profile-level-id=640029;level-asymmetry-allowed=1',
        'a=rtcp-mux'
      )

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

    return {
      ffmpegInputArguments,
      inputSdpLines,
    }
  }

  async startTranscoding(ffmpegOptions: FfmpegOptions) {
    const videoPort = await this.reservePort(1),
      audioPort = await this.reservePort(1),
      transcodeVideoStream = ffmpegOptions.video !== false,
      { ffmpegInputArguments, inputSdpLines } = this.prepareTranscoder(
        transcodeVideoStream,
        ffmpegOptions.input,
        audioPort,
        videoPort,
        'pipe:'
      ),
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

    this.onCallEnded.subscribe(() => ff.stop())

    ff.writeStdin(inputSdpLines.filter((x) => Boolean(x)).join('\n'))

    // Activate the stream now that ffmpeg is ready to receive
    await this.activate()
  }

  activated = false
  async activate() {
    if (this.activated) {
      return
    }
    this.activated = true

    await firstValueFrom(this.onCallAnswered)
    this.sendMessage({ method: 'activate_session' })
    this.sendMessage({
      video_enabled: true,
      audio_enabled: true,
      method: 'stream_options',
    })
  }

  async activateCameraSpeaker() {
    await firstValueFrom(this.onCallAnswered)
    this.sendMessage({
      stealth_mode: false,
      method: 'camera_options',
    })
  }

  private sendMessage(message: Record<any, any>) {
    this.ws.send(JSON.stringify(message))
  }

  private callEnded() {
    try {
      this.sendMessage({
        reason: { code: 0, text: '' },
        method: 'close',
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
