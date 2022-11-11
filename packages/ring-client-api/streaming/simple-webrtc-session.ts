import { RingCamera } from '../ring-camera'
import { generateUuid } from '../util'
import { RingRestClient } from '../rest-client'

function liveViewUrl(path: string) {
  return `https://api.ring.com/integrations/v1/liveview/${path}`
}

export class SimpleWebRtcSession {
  readonly sessionId = generateUuid()

  constructor(
    private readonly camera: RingCamera,
    private restClient: RingRestClient
  ) {}

  async start(sdp: string): Promise<string> {
    const response = await this.restClient.request<{ sdp: string }>({
      method: 'POST',
      url: liveViewUrl('start'),
      json: {
        session_id: this.sessionId,
        device_id: this.camera.id,
        sdp,
        protocol: 'webrtc',
      },
    })
    return response.sdp
  }

  async end() {
    const resp = await this.restClient.request<any>({
      method: 'POST',
      url: liveViewUrl('end'),
      json: {
        session_id: this.sessionId,
      },
    })

    return resp
  }

  async activateCameraSpeaker() {
    await this.restClient.request<any>({
      method: 'PATCH',
      url: liveViewUrl('options'),
      json: {
        session_id: this.sessionId,
        actions: ['turn_off_stealth_mode'],
      },
    })
  }
}
