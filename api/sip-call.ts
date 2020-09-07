import { Subject } from 'rxjs'
import {
  delay,
  logDebug,
  logError,
  logInfo,
  randomInteger,
  randomString,
} from './util'
import { RtpDescription, RtpOptions, RtpStreamDescription } from './rtp-utils'
import { createCryptoLine, decodeSrtpOptions } from '@homebridge/camera-utils'

const sip = require('sip'),
  sdp = require('sdp')

export const expiredDingError = new Error('Ding expired, received 480')

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

export interface SipOptions {
  to: string
  from: string
  dingId: string
  localIp: string
}

function getRandomId() {
  return Math.floor(Math.random() * 1e6).toString()
}

function getRtpDescription(
  sections: string[],
  mediaType: 'audio' | 'video'
): RtpStreamDescription {
  try {
    const section = sections.find((s) => s.startsWith('m=' + mediaType)),
      { port } = sdp.parseMLine(section),
      lines = sdp.splitLines(section),
      cryptoLine = lines.find((l: string) => l.startsWith('a=crypto')),
      ssrcLine = lines.find((l: string) => l.startsWith('a=ssrc')),
      iceUFragLine = lines.find((l: string) => l.startsWith('a=ice-ufrag')),
      icePwdLine = lines.find((l: string) => l.startsWith('a=ice-pwd')),
      encodedCrypto = cryptoLine.match(/inline:(\S*)/)[1]

    return {
      port,
      ssrc: +ssrcLine.match(/ssrc:(\S*)/)[1],
      iceUFrag: iceUFragLine.match(/ice-ufrag:(\S*)/)[1],
      icePwd: icePwdLine.match(/ice-pwd:(\S*)/)[1],
      ...decodeSrtpOptions(encodedCrypto),
    }
  } catch (e) {
    logError('Failed to parse SDP from Ring')
    logError(sections.join('\r\n'))
    throw e
  }
}

function parseRtpDescription(inviteResponse: {
  content: string
}): RtpDescription {
  const sections: string[] = sdp.splitSections(inviteResponse.content),
    oLine = sdp.parseOLine(sections[0])

  return {
    address: oLine.address,
    audio: getRtpDescription(sections, 'audio'),
    video: getRtpDescription(sections, 'video'),
  }
}

export class SipCall {
  private seq = 20
  private fromParams = { tag: getRandomId() }
  private toParams: { tag?: string } = {}
  private callId = getRandomId()
  private sipClient: SipClient
  public readonly onEndedByRemote = new Subject()
  private destroyed = false
  private cameraConnected?: () => any
  private cameraConnectedPromise = new Promise((resolve) => {
    this.cameraConnected = resolve
  })

  public readonly sdp: string
  public readonly audioUfrag = randomString(16)
  public readonly videoUfrag = randomString(16)

  constructor(
    private sipOptions: SipOptions,
    rtpOptions: RtpOptions,
    tlsPort: number
  ) {
    const { audio, video } = rtpOptions,
      { from } = this.sipOptions,
      host = this.sipOptions.localIp

    this.sipClient = sip.create(
      {
        host,
        hostname: host,
        tls_port: tlsPort,
        tls: {
          rejectUnauthorized: false,
        },
        tcp: false,
        udp: false,
      },
      (request: SipRequest) => {
        if (request.method === 'BYE') {
          this.sipClient.send(this.sipClient.makeResponse(request, 200, 'Ok'))

          if (this.destroyed) {
            this.onEndedByRemote.next()
          }
        } else if (
          request.method === 'MESSAGE' &&
          request.content === 'event=camera_connected'
        ) {
          logDebug('camera connected to ring server')
          this.cameraConnected?.()
        }
      }
    )

    this.sdp = [
      'v=0',
      `o=${from.split(':')[1].split('@')[0]} 3747 461 IN IP4 ${host}`,
      's=Talk',
      `c=IN IP4 ${host}`,
      'b=AS:380',
      't=0 0',
      `m=audio ${audio.port} RTP/SAVPF 0`,
      'a=rtpmap:0 PCMU/8000',
      createCryptoLine(audio),
      'a=rtcp-mux',
      'a=rtcp-fb:* trr-int 5',
      'a=rtcp-fb:* ccm tmmbr',
      `a=ice-ufrag:${this.audioUfrag}`,
      `a=ice-pwd:${randomString(22)}`,
      `a=candidate:${randomInteger()} 1 udp ${randomInteger()} ${host} ${
        audio.port
      } typ host generation 0 network-id 1 network-cost 50`,
      `m=video ${video.port} RTP/SAVPF 99`,
      'a=rtpmap:99 H264/90000',
      createCryptoLine(video),
      'a=rtcp-mux',
      'a=rtcp-fb:* trr-int 5',
      'a=rtcp-fb:* ccm tmmbr',
      'a=rtcp-fb:99 nack pli',
      'a=rtcp-fb:99 ccm tstr',
      'a=rtcp-fb:99 ccm fir',
      `a=ice-ufrag:${this.videoUfrag}`,
      `a=ice-pwd:${randomString(22)}`,
      `a=candidate:${randomInteger()} 1 udp ${randomInteger()} ${host} ${
        video.port
      } typ host generation 0 network-id 1 network-cost 50`,
    ]
      .filter((l) => l)
      .join('\r\n')
  }

  request({
    method,
    headers,
    content,
    seq,
  }: {
    method: string
    headers?: Partial<SipHeaders>
    content?: string
    seq?: number
  }) {
    if (this.destroyed) {
      return Promise.reject(
        new Error('SIP request made after call was destroyed')
      )
    }

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
              params: this.toParams,
            },
            from: {
              uri: this.sipOptions.from,
              params: this.fromParams,
            },
            'max-forwards': 70,
            'call-id': this.callId,
            'User-Agent': 'Android/3.15.3 (belle-sip/1.4.2)',
            cseq: { seq, method },
            ...headers,
          },
          content: content || '',
        },
        (response: SipResponse) => {
          if (response.headers.to.params && response.headers.to.params.tag) {
            this.toParams.tag = response.headers.to.params.tag
          }

          if (response.status >= 300) {
            if (response.status === 480 && method === 'INVITE') {
              const { dingId } = this.sipOptions
              logInfo(
                `Ding ${dingId} is expired (${response.status}).  Fetching a new ding and trying video stream again`
              )
              reject(expiredDingError)
              return
            }

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
              this.ackWithInfo(seq!).catch((e) => {
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

  private async ackWithInfo(seq: number) {
    // Don't wait for ack, it won't ever come back.
    this.request({
      method: 'ACK',
      seq, // The ACK must have the original sequence number.
    })

    // SIP session will be terminated after 60 seconds if these aren't sent
    await this.sendDtmf('2')
    await this.sendKeyFrameRequest()
  }

  sendDtmf(key: string) {
    return this.request({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/dtmf-relay',
      },
      content: `Signal=${key}\r\nDuration=250`,
    })
  }

  private sendKeyFrameRequest() {
    return this.request({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/media_control+xml',
      },
      content:
        '<?xml version="1.0" encoding="utf-8" ?><media_control>  <vc_primitive>    <to_encoder>      <picture_fast_update></picture_fast_update>    </to_encoder>  </vc_primitive></media_control>',
    })
  }

  async invite() {
    const { from } = this.sipOptions,
      inviteResponse = await this.request({
        method: 'INVITE',
        headers: {
          supported: 'replaces, outbound',
          allow:
            'INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO, UPDATE',
          'content-type': 'application/sdp',
          contact: [{ uri: from }],
        },
        content: this.sdp,
      })

    return parseRtpDescription(inviteResponse)
  }

  async requestKeyFrame() {
    // camera connected event doesn't always happen if cam is already streaming.  2 second fallback
    await Promise.race([this.cameraConnectedPromise, delay(2000)])
    logDebug('requesting key frame')
    await this.sendKeyFrameRequest()
  }

  private speakerActivated = false
  async activateCameraSpeaker() {
    if (this.speakerActivated) {
      return
    }

    this.speakerActivated = true
    logDebug('Activating camera speaker')
    await this.sendDtmf('1').catch((e) => {
      logError('Failed to activate camera speaker')
      logError(e)
    })
  }

  sendBye() {
    return this.request({ method: 'BYE' }).catch(() => {
      // Don't care if we get an exception here.
    })
  }

  destroy() {
    this.destroyed = true
    this.sipClient.destroy()
  }
}
