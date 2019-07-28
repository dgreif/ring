import { logError } from './util'

const ip = require('ip')
const sip = require('sip')
const sdp = require('sdp')

const dialogs: any = {}

export interface SipOptions {
  to: string
  from: string
  dingId: string
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

let sipStarted = false
function startSip() {
  const host = ip.address()
  sip.start(
    {
      host,
      hostname: host,
      tls: {
        rejectUnauthorized: false
      }
    },
    function(rq: SipResponse & { method: 'string' }) {
      // todo: this has method: 'BYE' instead of `response`
      // console.log('DIALOG', rq)

      // TODO: handle BYE from other end

      if (rq.headers.to.params.tag) {
        // check if it's an in dialog request
        var id = [
          rq.headers['call-id'],
          rq.headers.to.params.tag,
          rq.headers.from.params.tag
        ].join(':')

        if (dialogs[id]) {
          dialogs[id](rq)
        } else {
          sip.send(sip.makeResponse(rq, 481, "Call doesn't exists"))
        }
      } else {
        sip.send(sip.makeResponse(rq, 405, 'Method not allowed'))
      }
    }
  )

  sipStarted = true
}

export class SipSession {
  private readonly defaultHeaders: Partial<SipHeaders>
  private seq = 20
  private stopped = false

  constructor(private sipOptions: SipOptions, private rtpOptions: RtpOptions) {
    const { to, from, dingId } = this.sipOptions

    this.defaultHeaders = {
      to: {
        name: '"FS Doorbot"',
        uri: to
      },
      from: {
        uri: from,
        params: { tag: getRandomId() }
      },
      'max-forwards': 70,
      'call-id': getRandomId(),
      'X-Ding': dingId,
      'X-Authorization': '',
      'User-Agent': 'Android/3.15.3 (belle-sip/1.4.2)'
    }
  }

  sipRequest({
    method,
    headers,
    contentLines
  }: {
    method: string
    headers: Partial<SipHeaders>
    contentLines?: string[]
  }) {
    const { to } = this.sipOptions

    return new Promise<SipResponse>((resolve, reject) => {
      function failWithMessage(message: string) {
        logError(message)
        reject(new Error(message))
      }

      sip.send(
        {
          method,
          uri: to,
          headers: {
            ...this.defaultHeaders,
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
          // if (!this.stopped) {
          //   console.log('RESP', response)
          // }
          if (response.status >= 300) {
            failWithMessage(
              `sip ${method} request failed with status ` + response.status
            )
          } else if (response.status < 200) {
            // call made progress, do nothing and wait for another response
            // console.log('call progress status ' + response.status)
          } else {
            if (method === 'INVITE' && !this.stopped) {
              const headers = {
                ...this.defaultHeaders,
                to: response.headers.to,
                cseq: { seq: response.headers.cseq.seq, method: 'ACK' },
                'X-Ding': undefined,
                'X-Authorization': undefined
              }
              delete headers['X-Ding']
              delete headers['X-Authorization']

              sip.send({
                method: 'ACK',
                uri: to,
                headers
              })
            }

            resolve(response)
          }
        }
      )
    })
  }

  async getRemoteRtpOptions(): Promise<RtpOptions> {
    if (!sipStarted) {
      startSip()
    }

    const { from } = this.sipOptions,
      { address, audio, video } = this.rtpOptions

    const inviteResponse = await this.sipRequest({
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

        // { codec: 'AAC-eld',
        //   channel: 1,
        //   bit_rate: 0,
        //   sample_rate: 16,
        //   packet_time: 30,
        //   pt: 110,
        //   ssrc: 3329507484,
        //   max_bit_rate: 24,
        //   rtcp_interval: 1084227584,
        //   comfort_pt: 13 } }
      }),
      sections: string[] = sdp.splitSections(inviteResponse.content),
      oLine = sdp.parseOLine(sections[0]),
      rtpOptions = {
        address: oLine.address,
        audio: getRtpDescription(sections, 'audio'),
        video: getRtpDescription(sections, 'video')
      }

    // TODO: need to figure out how to keep the stream alive by watching the app on android

    return rtpOptions
  }

  async startRtp() {
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

  stop() {
    if (this.stopped) {
      return
    }

    this.stopped = true

    this.sipRequest({
      method: 'BYE',
      headers: {}
    }).catch(() => {
      // Do nothing if BYE fails
    })
  }
}
