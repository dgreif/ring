import { logError } from './util'
import { Socket } from 'dgram'
import { Subject } from 'rxjs'

const ip = require('ip')
const sip = require('sip')
const sdp = require('sdp')

export interface SipOptions {
  to: string
  from: string
  dingId: string
  port?: number
}

export interface StreamRtpOptions {
  port: number
  srtpKey?: Buffer
  srtpSalt?: Buffer
}

export interface RtpOptions {
  address: string
  audio: StreamRtpOptions
  video: StreamRtpOptions
}

interface UriOptions {
  name?: string
  uri: string
  params?: any
}

interface SipHeaders {
  [name: string]: string | any
  cseq: { seq: number; method: string }
  to: UriOptions
  from: UriOptions
  contact?: UriOptions[]
  via?: UriOptions[]
  contentLength: number
}

export interface SipResponse {
  status: number
  reason: string
  headers: SipHeaders
  content: string
}

function getRandomId() {
  return Math.floor(Math.random() * 1e6).toString()
}

function createCryptoLine({ srtpKey, srtpSalt }: StreamRtpOptions) {
  if (!srtpKey || !srtpSalt) {
    return ''
  }
  const srtpValue = Buffer.concat([srtpKey, srtpSalt]).toString('base64')
  return `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${srtpValue}`
}

function getRtpDescription(
  sections: string[],
  mediaType: 'audio' | 'video'
): StreamRtpOptions {
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

function parseRtpOptions(inviteResponce: any) {
  const sections: string[] = sdp.splitSections(inviteResponce.content)
  const oLine = sdp.parseOLine(sections[0])
  const rtpOptions = {
    address: oLine.address,
    audio: getRtpDescription(sections, 'audio'),
    video: getRtpDescription(sections, 'video')
  }
  return rtpOptions
}

export class SipSession {
  private dialogs: any = {}
  private seq = 20
  private fromParams = { tag: getRandomId() }
  private toParams: any = {}
  private callId = getRandomId()
  private interval?: number = undefined

  videoStream = {
    onRtpPacket: new Subject()
  }

  audioStream = {
    onRtpPacket: new Subject()
  }

  onEndDone = new Subject()

  constructor(
    private sipOptions: SipOptions,
    private rtpOptions: RtpOptions,
    private videoSocket: Socket,
    private audioSocket: Socket
  ) {
    const { port } = sipOptions

    const host = ip.address() // I feel like host should be extracted into SIP options as well?
    sip.start(
      {
        port: port,
        host,
        hostname: host,
        tls: {
          rejectUnauthorized: false
        }
      },
      this.messageReceived
    )
  }

  private messageReceived(rq: SipResponse & { method: string }) {
    if (rq.method === 'BYE') {
      this.onEndDone.next()
    }

    if (rq.headers.to.params.tag) {
      // check if it's an in dialog request
      var id = [
        rq.headers['call-id'],
        rq.headers.to.params.tag,
        rq.headers.from.params.tag
      ].join(':')

      if (this.dialogs[id]) {
        // We never set dialogs to anything... what does this do?
        this.dialogs[id](rq)
      } else {
        sip.send(sip.makeResponse(rq, 481, "Call doesn't exists"))
      }
    } else {
      sip.send(sip.makeResponse(rq, 405, 'Method not allowed'))
    }
  }

  async start() {
    const res = await this.invite()
    const rtpOptions = parseRtpOptions(res)
    this.videoSocket.on('message', message => {
      this.videoStream.onRtpPacket.next(message)
    })

    this.audioSocket.on('message', message => {
      this.audioStream.onRtpPacket.next(message)
    })

    this.videoSocket.send('', rtpOptions.video.port, rtpOptions.address)
    this.audioSocket.send('', rtpOptions.audio.port, rtpOptions.address)

    // Keep alive.
    this.interval = <any>setInterval(() => {
      this.videoSocket.send('', rtpOptions.video.port, rtpOptions.address)
      this.audioSocket.send('', rtpOptions.audio.port, rtpOptions.address)
    }, 15 * 1000)
  }

  sipRequest({
    method,
    headers,
    contentLines
  }: {
    method: string
    headers?: Partial<SipHeaders>
    contentLines?: string[]
  }) {
    return new Promise<SipResponse>((resolve, reject) => {
      function failWithMessage(message: string) {
        logError(message)
        reject(new Error(message))
      }

      const defaultHeaders = {
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
        'User-Agent': 'Android/3.15.3 (belle-sip/1.4.2)'
      }

      sip.send(
        {
          method,
          uri: this.sipOptions.to,
          headers: {
            ...defaultHeaders,
            cseq: { seq: this.seq++, method },
            ...headers
          },
          content: contentLines
            ? contentLines
                .filter(l => l)
                .map(line => line + '\r\n')
                .join('')
            : undefined
        },
        (response: SipResponse) => {
          if (response.headers.to.params.tag) {
            this.toParams.tag = response.headers.to.params.tag
          }

          if (response.status >= 300) {
            failWithMessage(
              `sip ${method} request failed with status ` + response.status
            )
          } else if (response.status < 200) {
            // call made progress, do nothing and wait for another response
            // console.log('call progress status ' + response.status)
          } else {
            if (method === 'INVITE') {
              // The ACK must be sent with every OK to keep the connection alive.
              this.ackWithInfo()
            }
            resolve(response)
          }
        }
      )
    })
  }

  async invite() {
    const { address, audio, video } = this.rtpOptions
    const { from } = this.sipOptions

    return await this.sipRequest({
      method: 'INVITE',
      headers: {
        supported: 'replaces, outbound',
        allow:
          'INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO, UPDATE',
        'content-type': 'application/sdp',
        contact: [{ uri: from }]
      },
      contentLines: [
        'v=0',
        `o=${from.split(':')[1].split('@')[0]} 3747 461 IN IP4 ${address}`,
        's=Talk',
        `c=IN IP4 ${address}`,
        'b=AS:380',
        't=0 0',
        'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',
        `m=audio ${audio.port} RTP/${audio.srtpKey ? 'S' : ''}AVP 110 0 101`,
        'a=rtpmap:110 mpeg4-generic/16000', // TODO: figure out aac-eld sdp
        'a=fmtp:110 mode=AAC-eld',
        'a=rtpmap:101 telephone-event/48000',
        createCryptoLine(audio),
        'a=rtcp-mux',
        `m=video ${video.port} RTP/${video.srtpKey ? 'S' : ''}AVP 99`,
        'a=rtpmap:99 H264/90000',
        'a=fmtp:99 profile-level-id=42A01E; packetization-mode=1',
        // 'a=fmtp:96 profile-level-id=42801F', // todo: profiles and bit rates
        createCryptoLine(video),
        'a=rtcp-mux'
      ]
    })
  }

  async ackWithInfo() {
    // Don't wait for ack, it won't ever come back.
    this.sipRequest({
      method: 'ACK',
      headers: {
        cseq: { seq: 20, method: 'ACK' } // The ACK must have the original sequence number.
      }
    })

    // SIP session will be terminated after 30 seconds if INFO isn't sent.
    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/dtmf-relay'
      },
      contentLines: ['Signal=2', 'Duration=250']
    })

    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/media_control+xml'
      },
      contentLines: [
        '<?xml version="1.0" encoding="utf-8" ?><media_control>  <vc_primitive>    <to_encoder>      <picture_fast_update></picture_fast_update>    </to_encoder>  </vc_primitive></media_control>'
      ]
    })
  }

  async stop() {
    clearInterval(this.interval)
    try {
      await this.sipRequest({ method: 'BYE' })
    } catch {} // Don't care if we get an exception here.
  }
}
