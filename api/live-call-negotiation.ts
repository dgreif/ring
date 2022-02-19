import { parseLiveCallSession } from './rtp-utils'
import { WebSocket } from 'ws'
import { firstValueFrom, fromEvent, map, ReplaySubject } from 'rxjs'
import { logDebug, logError } from './util'
import { RingCamera } from './ring-camera'
import { Subscribed } from './subscribed'

export interface InitializationMessage {
  method: 'initialization'
  text: 'Done'
}

export interface OfferMessage {
  method: 'sdp'
  sdp: string
  type: 'offer'
}

export interface IceCandidateMessage {
  method: 'ice'
  ice: string
  mlineindex: number
}

export type LiveCallNegotiationMessage =
  | InitializationMessage
  | OfferMessage
  | IceCandidateMessage

export class LiveCallNegotiation extends Subscribed {
  private readonly ws
  private readonly onWsOpen
  readonly onMessage
  readonly onCallAnswered = new ReplaySubject<string>(1)
  readonly onCallEnded = new ReplaySubject<void>(1)

  constructor(private sessionId: string, public camera: RingCamera) {
    super()

    const liveCallSession = parseLiveCallSession(sessionId)
    this.ws = new WebSocket(
      `wss://${liveCallSession.rms_fqdn}:${liveCallSession.webrtc_port}/`,
      {
        headers: {
          API_VERSION: '3.1',
          API_TOKEN: sessionId,
          CLIENT_INFO:
            'Ring/3.48.0;Platform/Android;OS/7.0;Density/2.0;Device/samsung-SM-T710;Locale/en-US;TimeZone/GMT-07:00',
        },
      }
    )

    this.onMessage = fromEvent(this.ws, 'message').pipe(
      map((message) => {
        return JSON.parse(
          (message as MessageEvent).data
        ) as LiveCallNegotiationMessage
      })
    )

    this.onWsOpen = fromEvent(this.ws, 'open')
    const onError = fromEvent(this.ws, 'error'),
      onClose = fromEvent(this.ws, 'close')

    this.addSubscriptions(
      this.onWsOpen.subscribe(() => {
        logDebug(`WebSocket connected for ${this.camera.name}`)
      }),

      onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      onClose.subscribe(() => {
        this.callEnded()
      })
    )
  }

  private sendMessage(message: Record<any, any>) {
    this.ws.send(JSON.stringify(message))
  }

  sendAnswer(answer: RTCSessionDescriptionInit) {
    this.sendMessage({
      method: 'sdp',
      ...answer,
    })

    this.onCallAnswered.next(answer.sdp!)
  }

  activated = false
  async activate() {
    if (this.activated) {
      return
    }
    this.activated = true

    await firstValueFrom(this.onCallAnswered)
    this.sendMessage({ method: 'activate_session' })
    this.sendMessage({
      video_enabled: true,
      audio_enabled: true,
      method: 'stream_options',
    })
  }

  async activateCameraSpeaker() {
    await firstValueFrom(this.onCallAnswered)
    this.sendMessage({
      stealth_mode: false,
      method: 'camera_options',
    })
  }

  protected callEnded() {
    try {
      this.sendMessage({
        reason: { code: 0, text: '' },
        method: 'close',
      })
      this.ws.close()
    } catch (_) {
      // ignore any errors since we are stopping the call
    }

    this.unsubscribe()
    this.onCallEnded.next()
  }
}
