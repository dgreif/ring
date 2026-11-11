// Stand-in for @eneris/push-receiver in fake mode. Instead of connecting to
// Firebase it reads a server-sent event stream from the fake Ring cloud, so
// `ring-ctl emit ding|motion` reaches ring-client-api exactly like a real
// push notification would.
import { randomUUID } from 'node:crypto'
import { type ClientRequest, request } from 'node:http'

type Listener = (payload: any) => void

const sinkUrl = process.env.RING_VERIFY_SINK_URL

export class PushReceiver {
  private credentials: any
  private credentialListeners = new Set<Listener>()
  private notificationListeners = new Set<Listener>()
  private eventListeners = new Map<string, Set<Listener>>()
  private stream?: ClientRequest
  private stopped = false
  private resolveReady!: () => void
  whenReady: Promise<void>

  constructor(options: { credentials?: any } = {}) {
    this.credentials = options.credentials
    this.whenReady = new Promise((resolve) => {
      this.resolveReady = resolve
    })
  }

  onCredentialsChanged(listener: Listener) {
    this.credentialListeners.add(listener)
    return () => this.credentialListeners.delete(listener)
  }

  onNotification(listener: Listener) {
    this.notificationListeners.add(listener)
    return () => this.notificationListeners.delete(listener)
  }

  on(event: string, listener: Listener) {
    const listeners = this.eventListeners.get(event) ?? new Set()
    listeners.add(listener)
    this.eventListeners.set(event, listeners)
    return () => listeners.delete(listener)
  }

  async connect() {
    this.stopped = false
    if (!this.credentials?.fcm?.token) {
      const oldCredentials = this.credentials
      this.credentials = {
        fcm: { token: 'fake-fcm-token-' + randomUUID() },
        gcm: { androidId: 'fake', securityToken: 'fake', token: 'fake' },
        keys: { authSecret: 'fake', privateKey: 'fake', publicKey: 'fake' },
        config: { fake: true },
      }
      for (const listener of this.credentialListeners) {
        listener({ oldCredentials, newCredentials: this.credentials })
      }
    }
    this.openStream()
    this.resolveReady()
  }

  disconnect() {
    this.stopped = true
    this.stream?.destroy()
  }

  destroy() {
    this.disconnect()
  }

  private openStream() {
    if (!sinkUrl || this.stopped) {
      return
    }

    let buffer = ''
    const req = request(
      new URL('/_control/push-stream', sinkUrl),
      { method: 'GET', headers: { accept: 'text/event-stream' } },
      (res) => {
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          buffer += chunk
          let boundary = buffer.indexOf('\n\n')
          while (boundary !== -1) {
            const event = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            this.handleEvent(event)
            boundary = buffer.indexOf('\n\n')
          }
        })
        res.on('end', () => this.reconnect())
      },
    )
    req.on('error', () => this.reconnect())
    req.end()
    this.stream = req
  }

  private reconnect() {
    if (!this.stopped) {
      setTimeout(() => this.openStream(), 1000)
    }
  }

  private handleEvent(event: string) {
    const dataLine = event.split('\n').find((line) => line.startsWith('data: '))
    if (!dataLine) {
      return
    }
    const { data } = JSON.parse(dataLine.slice('data: '.length)),
      persistentId = randomUUID(),
      message = { data, from: 'fake-ring', fcmMessageId: persistentId }
    for (const listener of this.notificationListeners) {
      listener({ message, persistentId })
    }
  }
}
