import { logDebug, logError } from './util'
import { RemoteInfo, Socket } from 'dgram'
import {
  interval,
  Observable,
  ReplaySubject,
  Subject,
  Subscription
} from 'rxjs'
import {
  bindProxyPorts,
  getSrtpValue,
  releasePort,
  reservePorts,
  sendUdpHolePunch,
  SrtpOptions
} from './rtp-utils'
import { spawn } from 'child_process'

const ip = require('ip'),
  sip = require('sip'),
  sdp = require('sdp')

export interface SipOptions {
  to: string
  from: string
  dingId: string
  host?: string
  port?: number
  tlsPort: number
}

export interface RtpStreamOptions extends Partial<SrtpOptions> {
  port: number
}

export interface RtpPacket {
  message: Buffer
  info: RemoteInfo
}

export interface RtpStream {
  socket: Socket
  port: number
  onRtpPacket: Observable<RtpPacket>
}

export interface RtpOptions {
  address: string
  audio: RtpStreamOptions
  video: RtpStreamOptions
}

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

interface UriOptions {
  name?: string
  uri: string
  params?: { tag?: string }
}

interface SipHeaders {
  [name: string]: string | any
  cseq: { seq: number; method: string }
  to: UriOptions
  from: UriOptions
  contact?: UriOptions[]
  via?: UriOptions[]
}

export interface SipRequest {
  uri: UriOptions | string
  method: string
  headers: SipHeaders
  content: string
}

export interface SipResponse {
  status: number
  reason: string
  headers: SipHeaders
  content: string
}

export interface SipClient {
  send: (
    request: SipRequest | SipResponse,
    handler?: (response: SipResponse) => void
  ) => void
  destroy: () => void
  makeResponse: (
    response: SipRequest,
    status: number,
    method: string
  ) => SipResponse
}

function getRandomId() {
  return Math.floor(Math.random() * 1e6).toString()
}

function createCryptoLine(rtpStreamOptions: RtpStreamOptions) {
  const srtpValue = getSrtpValue(rtpStreamOptions)

  if (!srtpValue) {
    return ''
  }

  return `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${srtpValue}`
}

function getRtpDescription(
  sections: string[],
  mediaType: 'audio' | 'video'
): RtpStreamOptions {
  const section = sections.find(s => s.startsWith('m=' + mediaType)),
    { port } = sdp.parseMLine(section),
    lines = sdp.splitLines(section),
    cryptoLine = lines.find((l: string) => l.startsWith('a=crypto'))

  if (!cryptoLine) {
    return { port }
  }
  const encodedCrypto = cryptoLine.match(/inline:(\S*)/)[1],
    crypto = Buffer.from(encodedCrypto, 'base64')

  return {
    port,
    srtpKey: crypto.slice(0, 16),
    srtpSalt: crypto.slice(16, 30)
  }
}

function parseRtpOptions(inviteResponse: { content: string }): RtpOptions {
  const sections: string[] = sdp.splitSections(inviteResponse.content),
    oLine = sdp.parseOLine(sections[0]),
    rtpOptions = {
      address: oLine.address,
      audio: getRtpDescription(sections, 'audio'),
      video: getRtpDescription(sections, 'video')
    }
  return rtpOptions
}

const sipSessionActive = false
export class SipSession {
  private seq = 20
  private fromParams = { tag: getRandomId() }
  private toParams: { tag?: string } = {}
  private callId = getRandomId()
  private hasStarted = false
  private hasCallEnded = false
  private sipClient: SipClient
  private onAudioPacket = new Subject<RtpPacket>()
  private onVideoPacket = new Subject<RtpPacket>()
  private onCallEndedSubject = new ReplaySubject(1)
  private onRemoteRtpOptionsSubject = new ReplaySubject<RtpOptions>(1)
  private subscriptions: Subscription[] = []
  private reservedPorts = [this.sipOptions.tlsPort!]
  onCallEnded = this.onCallEndedSubject.asObservable()
  onRemoteRtpOptions = this.onRemoteRtpOptionsSubject.asObservable()
  sdp: string

  audioStream: RtpStream = {
    socket: this.audioSocket,
    port: this.rtpOptions.audio.port,
    onRtpPacket: this.onAudioPacket.asObservable()
  }
  videoStream: RtpStream = {
    socket: this.videoSocket,
    port: this.rtpOptions.video.port,
    onRtpPacket: this.onVideoPacket.asObservable()
  }

  constructor(
    private sipOptions: SipOptions,
    private rtpOptions: RtpOptions,
    private videoSocket: Socket,
    private audioSocket: Socket
  ) {
    if (sipSessionActive) {
      throw new Error('Only one sip session can be active at a time.')
    }
    const { tlsPort } = sipOptions,
      { address, audio, video } = rtpOptions,
      { from } = this.sipOptions,
      host = sipOptions.host || ip.address()
    this.sipClient = sip.create(
      {
        host,
        hostname: host,
        tls_port: tlsPort,
        tls: {
          rejectUnauthorized: false
        },
        tcp: false,
        udp: false
      },
      (request: SipRequest) => {
        if (request.method === 'BYE') {
          this.sipClient.send(this.sipClient.makeResponse(request, 200, 'Ok'))
          this.callEnded(false)
        }
      }
    )

    this.sdp = [
      'v=0',
      `o=${from.split(':')[1].split('@')[0]} 3747 461 IN IP4 ${address}`,
      's=Talk',
      `c=IN IP4 ${address}`,
      'b=AS:380',
      't=0 0',
      'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',

      `m=audio ${audio.port} RTP/${audio.srtpKey ? 'S' : ''}AVP 0 101`,
      'a=rtpmap:0 PCMU/8000',
      createCryptoLine(audio),
      'a=rtcp-mux',
      `m=video ${video.port} RTP/${video.srtpKey ? 'S' : ''}AVP 99`,
      'a=rtpmap:99 H264/90000',
      createCryptoLine(video),
      'a=rtcp-mux'
    ]
      .filter(l => l)
      .join('\r\n')
  }

  async start(ffmpegOptions?: FfmpegOptions) {
    if (this.hasStarted) {
      throw new Error('SIP Session has already been started')
    }
    this.hasStarted = true

    if (this.hasCallEnded) {
      throw new Error('SIP Session has already ended')
    }

    const remoteRtpOptions = await this.invite(),
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
  }

  sipRequest({
    method,
    headers,
    content,
    seq
  }: {
    method: string
    headers?: Partial<SipHeaders>
    content?: string
    seq?: number
  }) {
    return new Promise<SipResponse>((resolve, reject) => {
      seq = seq || this.seq++
      this.sipClient.send(
        {
          method,
          uri: this.sipOptions.to,
          headers: {
            to: {
              name: '"FS Doorbot"',
              uri: this.sipOptions.to,
              params: this.toParams
            },
            from: {
              uri: this.sipOptions.from,
              params: this.fromParams
            },
            'max-forwards': 70,
            'call-id': this.callId,
            'User-Agent': 'Android/3.15.3 (belle-sip/1.4.2)',
            cseq: { seq, method },
            ...headers
          },
          content: content || ''
        },
        (response: SipResponse) => {
          if (response.headers.to.params && response.headers.to.params.tag) {
            this.toParams.tag = response.headers.to.params.tag
          }

          if (response.status >= 300) {
            if (response.status !== 408 || method !== 'BYE') {
              logError(
                `sip ${method} request failed with status ` + response.status
              )
            }
            reject(
              new Error(
                `sip ${method} request failed with status ` + response.status
              )
            )
          } else if (response.status < 200) {
            // call made progress, do nothing and wait for another response
            // console.log('call progress status ' + response.status)
          } else {
            if (method === 'INVITE') {
              // The ACK must be sent with every OK to keep the connection alive.
              this.ackWithInfo(seq!).catch(e => {
                logError('Failed to send SDP ACK and INFO')
                logError(e)
              })
            }
            resolve(response)
          }
        }
      )
    })
  }

  async invite() {
    const { from } = this.sipOptions,
      inviteResponse = await this.sipRequest({
        method: 'INVITE',
        headers: {
          supported: 'replaces, outbound',
          allow:
            'INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO, UPDATE',
          'content-type': 'application/sdp',
          contact: [{ uri: from }]
        },
        content: this.sdp
      }),
      remoteRtpOptions = parseRtpOptions(inviteResponse)

    this.onRemoteRtpOptionsSubject.next(remoteRtpOptions)
    return remoteRtpOptions
  }

  private async ackWithInfo(seq: number) {
    // Don't wait for ack, it won't ever come back.
    this.sipRequest({
      method: 'ACK',
      seq // The ACK must have the original sequence number.
    })

    // SIP session will be terminated after 30 seconds if INFO isn't sent.
    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/dtmf-relay'
      },
      content: 'Signal=2\r\nDuration=250'
    })

    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/media_control+xml'
      },
      content:
        '<?xml version="1.0" encoding="utf-8" ?><media_control>  <vc_primitive>    <to_encoder>      <picture_fast_update></picture_fast_update>    </to_encoder>  </vc_primitive></media_control>'
    })
  }

  private async startTranscoder(
    ffmpegOptions: FfmpegOptions,
    remoteRtpOptions: RtpOptions
  ) {
    const transcodeVideoStream = ffmpegOptions.video !== false,
      [audioPort, videoPort] = [
        await this.reservePort(1),
        await this.reservePort(1)
      ],
      input = this.sdp
        .replace(
          getSrtpValue(this.rtpOptions.audio),
          getSrtpValue(remoteRtpOptions.audio)
        )
        .replace(
          getSrtpValue(this.rtpOptions.video),
          getSrtpValue(remoteRtpOptions.video)
        )
        .replace(this.audioStream.port.toString(), audioPort.toString())
        .replace(this.videoStream.port.toString(), videoPort.toString()),
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
        ...(ffmpegOptions.output || [])
      ],
      ff = spawn(
        'ffmpeg',
        ffOptions.map(x => x.toString())
      )

    ff.stderr.on('data', (data: any) => {
      logDebug(`ffmpeg stderr: ${data}`)
    })

    ff.on('close', code => {
      this.callEnded(true)
      logDebug(`ffmpeg exited with code ${code}`)
    })

    const exitHandler = () => {
      ff.stderr.pause()
      ff.stdout.pause()
      ff.kill()

      process.removeListener('SIGINT', exitHandler)
      process.removeListener('exit', exitHandler)
      releasePort(audioPort)
      releasePort(videoPort)
    }

    process.on('SIGINT', exitHandler)
    process.on('exit', exitHandler)
    this.onCallEnded.subscribe(exitHandler)

    ff.stdin.write(input)
    ff.stdin.end()

    const proxyPromises = [
      bindProxyPorts(audioPort, '127.0.0.1', 'audio', this)
    ]

    if (transcodeVideoStream) {
      proxyPromises.push(bindProxyPorts(videoPort, '127.0.0.1', 'video', this))
    }

    return Promise.all(proxyPromises)
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts(bufferPorts + 1)
    this.reservedPorts.push(...ports)
    return ports[0]
  }

  private callEnded(sendBye: boolean) {
    if (this.hasCallEnded) {
      return
    }
    this.hasCallEnded = true

    if (sendBye) {
      this.sipRequest({ method: 'BYE' }).catch(() => {
        // Don't care if we get an exception here.
      })
    }

    // clean up
    this.onCallEndedSubject.next()
    this.sipClient.destroy()
    this.videoSocket.close()
    this.audioSocket.close()
    this.subscriptions.forEach(subscription => subscription.unsubscribe())
    this.reservedPorts.forEach(releasePort)
  }

  stop() {
    this.callEnded(true)
  }
}
