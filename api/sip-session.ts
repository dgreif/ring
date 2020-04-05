import { logDebug } from './util'
import { RemoteInfo, Socket } from 'dgram'
import {
  interval,
  Observable,
  ReplaySubject,
  Subject,
  Subscription,
} from 'rxjs'
import {
  bindProxyPorts,
  getFfmpegPath,
  getSrtpValue,
  releasePorts,
  reservePorts,
  RtpOptions,
  sendUdpHolePunch,
} from './rtp-utils'
import { spawn } from 'child_process'
import { expiredDingError, SipCall, SipOptions } from './sip-call'
import { RingCamera } from './ring-camera'

export interface RtpPacket {
  message: Buffer
  info: RemoteInfo
}

export interface RtpStream {
  socket: Socket
  port: number
  onRtpPacket: Observable<RtpPacket>
}

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
  private onAudioPacket = new Subject<RtpPacket>()
  private onVideoPacket = new Subject<RtpPacket>()
  private onCallEndedSubject = new ReplaySubject(1)
  private onRemoteRtpOptionsSubject = new ReplaySubject<RtpOptions>(1)
  private subscriptions: Subscription[] = []
  private sipCall: SipCall = this.createSipCall(this.sipOptions)
  reservedPorts = [
    this.tlsPort,
    this.rtpOptions.video.port,
    this.rtpOptions.audio.port,
  ]
  onCallEnded = this.onCallEndedSubject.asObservable()
  onRemoteRtpOptions = this.onRemoteRtpOptionsSubject.asObservable()

  audioStream: RtpStream = {
    socket: this.audioSocket,
    port: this.rtpOptions.audio.port,
    onRtpPacket: this.onAudioPacket.asObservable(),
  }
  videoStream: RtpStream = {
    socket: this.videoSocket,
    port: this.rtpOptions.video.port,
    onRtpPacket: this.onVideoPacket.asObservable(),
  }

  constructor(
    private sipOptions: SipOptions,
    private rtpOptions: RtpOptions,
    private videoSocket: Socket,
    private audioSocket: Socket,
    private tlsPort: number,
    private camera: RingCamera
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
            this.audioSocket,
            this.audioStream.port,
            remoteRtpOptions.audio.port,
            remoteAddress,
            portMappingLifetime
          )
          sendUdpHolePunch(
            this.videoSocket,
            this.videoStream.port,
            remoteRtpOptions.video.port,
            remoteAddress,
            portMappingLifetime
          )
        }

      if (ffmpegOptions) {
        this.startTranscoder(ffmpegOptions, remoteRtpOptions)
      }

      this.audioSocket.on('message', (message, info) => {
        this.onAudioPacket.next({ message, info })
      })
      this.videoSocket.on('message', (message, info) => {
        this.onVideoPacket.next({ message, info })
      })

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
      [audioPort, videoPort] = [
        await this.reservePort(1),
        await this.reservePort(1),
      ],
      input = this.sipCall.sdp
        .replace(
          getSrtpValue(this.rtpOptions.audio),
          getSrtpValue(remoteRtpOptions.audio)
        )
        .replace(
          getSrtpValue(this.rtpOptions.video),
          getSrtpValue(remoteRtpOptions.video)
        )
        .replace(
          'm=audio ' + this.audioStream.port.toString(),
          'm=audio ' + audioPort.toString()
        )
        .replace(
          'm=video ' + this.videoStream.port.toString(),
          'm=video ' + videoPort.toString()
        ),
      ffOptions = [
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
      ff = spawn(
        getFfmpegPath(),
        ffOptions.map((x) => x.toString())
      )

    ff.stderr.on('data', (data: any) => {
      logDebug(`ffmpeg stderr: ${data}`)
    })

    ff.on('close', (code) => {
      this.callEnded(true)
      logDebug(`ffmpeg exited with code ${code}`)
    })

    const exitHandler = () => {
      ff.stderr.pause()
      ff.stdout.pause()
      ff.kill()

      process.off('SIGINT', exitHandler)
      process.off('exit', exitHandler)
    }

    process.on('SIGINT', exitHandler)
    process.on('exit', exitHandler)
    this.onCallEnded.subscribe(exitHandler)

    ff.stdin.write(input)
    ff.stdin.end()

    const proxyPromises = [
      bindProxyPorts(audioPort, '127.0.0.1', 'audio', this),
    ]

    if (transcodeVideoStream) {
      proxyPromises.push(bindProxyPorts(videoPort, '127.0.0.1', 'video', this))
    }

    return Promise.all(proxyPromises)
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
    this.videoSocket.close()
    this.audioSocket.close()
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    releasePorts(this.reservedPorts)
  }

  stop() {
    this.callEnded(true)
  }
}
