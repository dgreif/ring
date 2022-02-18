import { DingKind } from './ring-types'

export interface LiveCallSession {
  alexa_port: 18443
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

export function parseLiveCallSession(sessionId: string) {
  const encodedSession = sessionId.split('.')[1],
    buff = new Buffer(encodedSession, 'base64'),
    text = buff.toString('ascii')
  return JSON.parse(text) as LiveCallSession
}
