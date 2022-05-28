import { WebSocket } from 'ws'
import { RingCamera } from '../ring-camera'

import { DingKind } from '../ring-types'
import {
  StreamingConnectionBase,
  StreamingConnectionOptions,
} from './streaming-connection-base'
import { logDebug } from '../util'

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

interface LiveCallSession {
  alexa_port: number
  app_session_token: string
  availability_zone: 'availability-zone'
  custom_timer: { max_sec: number }
  ding_id: string
  ding_kind: DingKind
  doorbot_id: number
  exp: number
  ip: string
  port: number
  private_ip: string
  rms_fqdn: string
  rms_version: string
  rsp_port: number
  rtsp_port: number
  session_id: string
  sip_port: number
  webrtc_port: number
  webrtc_url: string
  wwr_port: number
}

function parseLiveCallSession(sessionId: string) {
  const encodedSession = sessionId.split('.')[1],
    buff = Buffer.from(encodedSession, 'base64'),
    text = buff.toString('ascii')
  return JSON.parse(text) as LiveCallSession
}

export class WebrtcConnection extends StreamingConnectionBase {
  constructor(
    private sessionId: string,
    camera: RingCamera,
    options: StreamingConnectionOptions
  ) {
    const liveCallSession = parseLiveCallSession(sessionId)
    super(
      new WebSocket(
        `wss://${liveCallSession.rms_fqdn}:${liveCallSession.webrtc_port}/`,
        {
          headers: {
            API_VERSION: '3.1',
            API_TOKEN: sessionId,
            CLIENT_INFO:
              'Ring/3.49.0;Platform/Android;OS/7.0;Density/2.0;Device/samsung-SM-T710;Locale/en-US;TimeZone/GMT-07:00',
          },
        }
      ),
      options
    )

    this.addSubscriptions(
      this.onWsOpen.subscribe(() => {
        logDebug(`WebSocket connected for ${camera.name}`)
      })
    )
  }

  protected async handleMessage(
    message: InitializationMessage | OfferMessage | IceCandidateMessage
  ) {
    switch (message.method) {
      case 'sdp':
        const answer = await this.pc.createAnswer(message)
        this.sendSessionMessage('sdp', answer)
        this.onCallAnswered.next(message.sdp)

        this.activate()
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.ice,
          sdpMLineIndex: message.mlineindex,
        })
        return
    }
  }

  protected sendSessionMessage(method: string, body: Record<any, any> = {}) {
    this.sendMessage({
      ...body,
      method,
    })
  }
}
