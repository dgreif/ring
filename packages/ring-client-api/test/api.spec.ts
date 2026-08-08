import { RingApi } from '../api.ts'
import { PushNotificationAction } from '../ring-types.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const receiverState = vi.hoisted(() => ({
  instances: [] as any[],
}))

vi.mock('@eneris/push-receiver', () => {
  class MockPushReceiver {
    public readonly config
    public readonly eventListeners = new Map<string, (...args: any[]) => void>()
    public notificationListener?: (event: any) => void
    public readonly whenReady = Promise.resolve()

    constructor(config: any) {
      this.config = config
      receiverState.instances.push(this)
    }

    onCredentialsChanged() {
      return () => undefined
    }

    on(event: string, listener: (...args: any[]) => void) {
      this.eventListeners.set(event, listener)
      return () => undefined
    }

    onNotification(listener: (event: any) => void) {
      this.notificationListener = listener
      return () => undefined
    }

    async connect() {}

    emitNotification(persistentId: string) {
      this.notificationListener?.({
        persistentId,
        message: {
          data: {
            android_config: JSON.stringify({
              category: PushNotificationAction.Motion,
            }),
            data: JSON.stringify({ device: { id: 123 } }),
          },
        },
      })
    }

    emitDisconnect() {
      this.eventListeners.get('ON_DISCONNECT')?.()
    }
  }

  return { PushReceiver: MockPushReceiver }
})

async function registerPushReceiver() {
  const api = new RingApi({ refreshToken: 'synthetic-refresh-token' }),
    processPushNotification = vi.fn(),
    camera = {
      id: 123,
      processPushNotification,
    }

  await (api as any).registerPushReceiver([camera], [])

  return {
    api,
    processPushNotification,
    receiver: receiverState.instances.at(-1),
  }
}

describe('RingApi push notification registration', () => {
  beforeEach(() => {
    receiverState.instances.length = 0
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-08T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses a 60 second heartbeat for the push receiver', async () => {
    const { receiver } = await registerPushReceiver()

    expect(receiver.config.heartbeatIntervalMs).toBe(60_000)
  })

  it('delivers a valid notification received immediately after startup', async () => {
    const { processPushNotification, receiver } = await registerPushReceiver()

    receiver.emitNotification('startup-event')

    expect(processPushNotification).toHaveBeenCalledOnce()
  })

  it('does not create a new drop window after a receiver disconnect', async () => {
    const { processPushNotification, receiver } = await registerPushReceiver()

    await vi.advanceTimersByTimeAsync(2_001)
    receiver.emitDisconnect()
    receiver.emitNotification('reconnect-event')

    expect(processPushNotification).toHaveBeenCalledOnce()
  })
})
