import { EventEmitter } from 'node:events'
import { Subject } from 'rxjs'
import { vi } from 'vitest'

type Listener = (...args: any[]) => void

/** Minimal undici-compatible WebSocket mock for Location hub tests. */
export class MockWebSocket extends EventEmitter {
  static instances: MockWebSocket[] = []
  url: string
  sent: string[] = []
  readyState = 0
  closed = false

  constructor(url: string) {
    super()
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      if (!this.closed) {
        this.readyState = 1
        this.emit('open', {})
      }
    })
  }

  static reset() {
    MockWebSocket.instances = []
  }

  static latest() {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }

  addEventListener(
    type: string,
    listener: Listener,
    options?: { once?: boolean },
  ) {
    if (options?.once) {
      this.once(type, listener)
    } else {
      this.on(type, listener)
    }
  }

  removeEventListener(type: string, listener: Listener) {
    this.off(type, listener)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code?: number, reason?: string) {
    this.closed = true
    this.readyState = 3
    this.emit('close', { code: code ?? 1000, reason: reason ?? '' })
  }

  /** Deliver a JSON hub envelope to Location's message handler. */
  receive(payload: unknown) {
    this.emit('message', { data: JSON.stringify(payload) })
  }
}

export function createMockRestClient(
  requestImpl?: (options: {
    url: string
    method?: string
    json?: unknown
  }) => Promise<unknown>,
): {
  request: any
  onSession: Subject<unknown>
  baseSessionMetadata: { api_version: number; device_model: string }
  clearTimeouts: any
  _internalOnly_pushNotificationCredentials: any
} {
  return {
    request: vi.fn(requestImpl ?? (() => Promise.resolve({}))),
    onSession: new Subject(),
    baseSessionMetadata: {
      api_version: 11,
      device_model: 'ring-client-api',
    },
    clearTimeouts: vi.fn(),
    _internalOnly_pushNotificationCredentials: undefined,
  }
}
