import { firstValueFrom, fromEvent, ReplaySubject, Subject } from 'rxjs'
import { concatMap, filter } from 'rxjs/operators'
import type { RtpPacket } from 'werift'
import { WebSocket } from 'ws'
import { Subscribed } from '../subscribed'
import { logDebug, logError, logInfo } from '../util'
import { BasicPeerConnection } from './peer-connection'

export interface StreamingConnectionOptions {
  createPeerConnection: () => BasicPeerConnection
}

export abstract class StreamingConnectionBase extends Subscribed {
  readonly onCallAnswered = new ReplaySubject<string>(1)
  readonly onCallEnded = new ReplaySubject<void>(1)
  readonly onMessage = new ReplaySubject<{ method: string }>()
  readonly onWsOpen
  protected readonly pc
  public sessionId: string | null = null

  readonly onAudioRtp
  readonly onVideoRtp

  constructor(
    protected ws: WebSocket,
    protected options: StreamingConnectionOptions
  ) {
    super()

    this.pc = options.createPeerConnection()

    // passing rtp packets is not supported for custom peer connections
    this.onAudioRtp = this.pc.onAudioRtp || new Subject<RtpPacket>()
    this.onVideoRtp = this.pc.onVideoRtp || new Subject<RtpPacket>()

    this.onWsOpen = fromEvent(this.ws, 'open')
    const onMessage = fromEvent(this.ws, 'message'),
      onError = fromEvent(this.ws, 'error'),
      onClose = fromEvent(this.ws, 'close')

    this.addSubscriptions(
      onMessage
        .pipe(
          concatMap((message) => {
            return this.handleMessage(
              JSON.parse((message as MessageEvent).data)
            )
          })
        )
        .subscribe(),

      onError.subscribe((e) => {
        logError(e)
        this.callEnded()
      }),

      onClose.subscribe(() => {
        this.callEnded()
      }),

      this.pc.onConnectionState.subscribe((state) => {
        if (state === 'failed') {
          logError('Stream connection failed')
          this.callEnded()
        }

        if (state === 'closed') {
          logDebug('Stream connection closed')
          this.callEnded()
        }
      })
    )
  }

  protected abstract handleMessage(message: { method: string }): Promise<void>
  protected abstract sendSessionMessage(
    method: string,
    body?: Record<any, any>
  ): void

  private activated = false
  activate() {
    if (this.activated) {
      return
    }
    this.activated = true

    // Fire and forget this call so that callers don't get hung up waiting for connection (which might not happen)
    firstValueFrom(
      this.pc.onConnectionState.pipe(filter((state) => state === 'connected'))
    )
      .then(() => {
        logInfo('Activating Session')
        this.sendSessionMessage('activate_session')
      })
      .catch((e) => {
        logError(e)
      })
  }

  activateCameraSpeaker() {
    // Fire and forget this call so that callers don't get hung up waiting for answer (which might not happen)
    firstValueFrom(this.onCallAnswered)
      .then(() => {
        this.sendSessionMessage('camera_options', {
          stealth_mode: false,
        })
      })
      .catch((e) => {
        logError(e)
      })
  }

  protected sendMessage(message: Record<any, any>) {
    if (this.hasEnded) {
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  sendAudioPacket(rtp: RtpPacket | Buffer) {
    if (this.hasEnded) {
      return
    }

    this.pc.sendAudioPacket?.(rtp)
  }

  private hasEnded = false
  protected callEnded() {
    if (this.hasEnded) {
      return
    }

    try {
      this.sendMessage({
        reason: { code: 0, text: '' },
        method: 'close',
      })
      this.ws.close()
    } catch (_) {
      // ignore any errors since we are stopping the call
    }
    this.hasEnded = true

    this.unsubscribe()
    this.onCallEnded.next()
    this.pc.close()
  }

  stop() {
    this.callEnded()
  }
}
