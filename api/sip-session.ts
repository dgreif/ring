import { ReplaySubject } from 'rxjs'
import {
  createStunResponder,
  isStunMessage,
  RtpDescription,
  RtpOptions,
  sendStunBindingRequest,
} from './rtp-utils'
import {
  createCryptoLine,
  FfmpegProcess,
  reservePorts,
  releasePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { expiredDingError, SipCall, SipOptions } from './sip-call'
import { RingCamera } from './ring-camera'
import { Subscribed } from './subscribed'
import { logDebug, logError } from './util'
import { getFfmpegPath } from './ffmpeg'

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

export class SipSession extends Subscribed {
  private hasStarted = false
  private hasCallEnded = false
  private onCallEndedSubject = new ReplaySubject(1)
  private sipCall: SipCall = this.createSipCall(this.sipOptions)
  public readonly reservedPorts = [
    this.tlsPort,
    this.rtpOptions.video.port,
    this.rtpOptions.audio.port,
  ]
  onCallEnded = this.onCallEndedSubject.asObservable()

  constructor(
    public readonly sipOptions: SipOptions,
    public readonly rtpOptions: RtpOptions,
    public readonly videoSplitter: RtpSplitter,
    public readonly audioSplitter: RtpSplitter,
    private readonly tlsPort: number,
    public readonly camera: RingCamera
  ) {
    super()
  }

  createSipCall(sipOptions: SipOptions) {
    if (this.sipCall) {
      this.sipCall.destroy()
    }

    const call = (this.sipCall = new SipCall(
      sipOptions,
      this.rtpOptions,
      this.tlsPort
    ))

    this.addSubscriptions(
      call.onEndedByRemote.subscribe(() => this.callEnded(false))
    )

    return this.sipCall
  }

  async start(ffmpegOptions?: FfmpegOptions): Promise<RtpDescription> {
    if (this.hasStarted) {
      throw new Error('SIP Session has already been started')
    }
    this.hasStarted = true

    if (this.hasCallEnded) {
      throw new Error('SIP Session has already ended')
    }

    try {
      const videoPort = await this.reservePort(1),
        audioPort = await this.reservePort(1),
        rtpDescription = await this.sipCall.invite()

      if (ffmpegOptions) {
        this.startTranscoder(
          ffmpegOptions,
          rtpDescription,
          audioPort,
          videoPort
        )
      }

      createStunResponder(this.videoSplitter)
      createStunResponder(this.audioSplitter)

      sendStunBindingRequest({
        rtpSplitter: this.videoSplitter,
        rtpDescription,
        localUfrag: this.sipCall.videoUfrag,
        type: 'video',
      })

      sendStunBindingRequest({
        rtpSplitter: this.audioSplitter,
        rtpDescription,
        localUfrag: this.sipCall.audioUfrag,
        type: 'audio',
      })

      return rtpDescription
    } catch (e) {
      if (e === expiredDingError) {
        const sipOptions = await this.camera.getUpdatedSipOptions(
          this.sipOptions.dingId
        )
        this.createSipCall(sipOptions)
        this.hasStarted = false
        return this.start(ffmpegOptions)
      }

      this.callEnded(true)
      throw e
    }
  }

  private startTranscoder(
    ffmpegOptions: FfmpegOptions,
    remoteRtpOptions: RtpOptions,
    audioPort: number,
    videoPort: number
  ) {
    const transcodeVideoStream = ffmpegOptions.video !== false,
      ffmpegArgs = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-f',
        'sdp',
        ...(ffmpegOptions.input || []),
        '-i',
        'pipe:',
        ...(ffmpegOptions.audio || ['-acodec', 'aac']),
        ...(transcodeVideoStream
          ? ffmpegOptions.video || ['-vcodec', 'copy']
          : []),
        ...(ffmpegOptions.output || []),
      ],
      ff = new FfmpegProcess({
        ffmpegArgs,
        ffmpegPath: getFfmpegPath(),
        exitCallback: () => this.callEnded(true),
        logLabel: `From Ring (${this.camera.name})`,
        logger: {
          error: logError,
          info: logDebug,
        },
      }),
      inputSdpLines = [
        'v=0',
        'o=105202070 3747 461 IN IP4 127.0.0.1',
        's=Talk',
        'c=IN IP4 127.0.0.1',
        'b=AS:380',
        't=0 0',
        'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',
        `m=audio ${audioPort} RTP/SAVP 0 101`,
        'a=rtpmap:0 PCMU/8000',
        createCryptoLine(remoteRtpOptions.audio),
        'a=rtcp-mux',
      ]

    if (transcodeVideoStream) {
      inputSdpLines.push(
        `m=video ${videoPort} RTP/SAVP 99`,
        'a=rtpmap:99 H264/90000',
        createCryptoLine(remoteRtpOptions.video),
        'a=rtcp-mux'
      )

      let haveReceivedStreamPacket = false
      this.videoSplitter.addMessageHandler(({ isRtpMessage, payloadType }) => {
        if (isStunMessage(payloadType)) {
          return null
        }

        if (!haveReceivedStreamPacket) {
          void this.sipCall.requestKeyFrame()
          haveReceivedStreamPacket = true
        }

        return {
          port: isRtpMessage ? videoPort : videoPort + 1,
        }
      })
    }

    this.onCallEnded.subscribe(() => ff.stop())

    ff.writeStdin(inputSdpLines.filter((x) => Boolean(x)).join('\n'))

    this.audioSplitter.addMessageHandler(({ isRtpMessage, payloadType }) => {
      if (isStunMessage(payloadType)) {
        return null
      }

      return {
        port: isRtpMessage ? audioPort : audioPort + 1,
      }
    })
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts({ count: bufferPorts + 1 })
    this.reservedPorts.push(...ports)
    return ports[0]
  }

  requestKeyFrame() {
    return this.sipCall.requestKeyFrame()
  }

  activateCameraSpeaker() {
    return this.sipCall.activateCameraSpeaker()
  }

  private callEnded(sendBye: boolean) {
    if (this.hasCallEnded) {
      return
    }
    this.hasCallEnded = true

    if (sendBye) {
      this.sipCall.sendBye()
    }

    // clean up
    this.onCallEndedSubject.next()
    this.sipCall.destroy()
    this.videoSplitter.close()
    this.audioSplitter.close()
    this.unsubscribe()
    releasePorts(this.reservedPorts)
  }

  stop() {
    this.callEnded(true)
  }
}
