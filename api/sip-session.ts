import { interval, ReplaySubject, Subscription } from 'rxjs'
import {
  createCryptoLine,
  releasePorts,
  reservePorts,
  RtpOptions,
  RtpSplitter,
  sendUdpHolePunch,
} from './rtp-utils'
import { expiredDingError, SipCall, SipOptions } from './sip-call'
import { RingCamera } from './ring-camera'
import { FfmpegProcess } from './ffmpeg'
import { takeUntil } from 'rxjs/operators'

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

export class SipSession {
  private hasStarted = false
  private hasCallEnded = false
  private onCallEndedSubject = new ReplaySubject(1)
  private onRemoteRtpOptionsSubject = new ReplaySubject<RtpOptions>(1)
  private subscriptions: Subscription[] = []
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
  ) {}

  createSipCall(sipOptions: SipOptions) {
    if (this.sipCall) {
      this.sipCall.destroy()
    }

    const call = (this.sipCall = new SipCall(
      sipOptions,
      this.rtpOptions,
      this.tlsPort
    ))

    this.subscriptions.push(
      call.onEndedByRemote.subscribe(() => this.callEnded(false)),
      call.onRemoteRtpOptionsSubject.subscribe(this.onRemoteRtpOptionsSubject)
    )

    return this.sipCall
  }

  async start(ffmpegOptions?: FfmpegOptions): Promise<RtpOptions> {
    if (this.hasStarted) {
      throw new Error('SIP Session has already been started')
    }
    this.hasStarted = true

    if (this.hasCallEnded) {
      throw new Error('SIP Session has already ended')
    }

    try {
      const remoteRtpOptions = await this.sipCall.invite(),
        { address: remoteAddress } = remoteRtpOptions,
        keepAliveInterval = 15,
        portMappingLifetime = keepAliveInterval + 5,
        holePunch = () => {
          sendUdpHolePunch(
            this.audioSplitter.socket,
            this.rtpOptions.audio.port,
            remoteRtpOptions.audio.port,
            remoteAddress,
            portMappingLifetime
          )
          sendUdpHolePunch(
            this.videoSplitter.socket,
            this.rtpOptions.video.port,
            remoteRtpOptions.video.port,
            remoteAddress,
            portMappingLifetime
          )
        }

      if (ffmpegOptions) {
        this.startTranscoder(ffmpegOptions, remoteRtpOptions)
      }

      // punch to begin with to make sure we get through NAT
      holePunch()

      // hole punch every 15 seconds to keep stream alive and port open
      this.subscriptions.push(
        interval(keepAliveInterval * 1000).subscribe(holePunch)
      )
      return remoteRtpOptions
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

  private async startTranscoder(
    ffmpegOptions: FfmpegOptions,
    remoteRtpOptions: RtpOptions
  ) {
    const transcodeVideoStream = ffmpegOptions.video !== false,
      ffOptions = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-f',
        'sdp',
        '-re',
        ...(ffmpegOptions.input || []),
        '-i',
        'pipe:',
        ...(ffmpegOptions.audio || ['-acodec', 'aac']),
        ...(transcodeVideoStream
          ? ffmpegOptions.video || ['-vcodec', 'copy']
          : []),
        ...(ffmpegOptions.output || []),
      ],
      ff = new FfmpegProcess(ffOptions, 'From Ring'),
      audioPort = await this.reservePort(1),
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
      const videoPort = await this.reservePort(1)
      inputSdpLines.push(
        `m=video ${videoPort} RTP/SAVP 99`,
        'a=rtpmap:99 H264/90000',
        createCryptoLine(remoteRtpOptions.video),
        'a=rtcp-mux'
      )
      this.videoSplitter.addMessageHandler(({ isRtpMessage }) => {
        return {
          port: isRtpMessage ? videoPort : videoPort + 1,
        }
      })
    }

    this.onCallEnded.pipe(takeUntil(ff.onClosed)).subscribe(() => ff.stop())
    ff.onClosed
      .pipe(takeUntil(this.onCallEnded))
      .subscribe(() => this.callEnded(true))

    ff.start(inputSdpLines.filter((x) => Boolean(x)).join('\n'))

    this.audioSplitter.addMessageHandler(({ isRtpMessage }) => {
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
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    releasePorts(this.reservedPorts)
  }

  stop() {
    this.callEnded(true)
  }
}
