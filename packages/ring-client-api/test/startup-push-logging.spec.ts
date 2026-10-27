import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushReceiver } from '@eneris/push-receiver'
import type { RingApi } from '../api.ts'

type NotificationListener = Parameters<PushReceiver['onNotification']>[0]

const receiver = vi.hoisted(() => ({
  connect: vi.fn(),
  on: vi.fn(),
  onCredentialsChanged: vi.fn(),
  onNotification: vi.fn<(listener: NotificationListener) => void>(),
}))

// Exercise Ring's real handler and logger without opening an FCM connection.
vi.mock('@eneris/push-receiver', () => ({
  PushReceiver: class {
    connect = receiver.connect
    on = receiver.on
    onCredentialsChanged = receiver.onCredentialsChanged
    onNotification = receiver.onNotification
  },
}))

describe('startup push logging', () => {
  let api: RingApi, notify: NotificationListener
  const logger = { logInfo: vi.fn(), logError: vi.fn() },
    camera = { id: 123, processPushNotification: vi.fn() },
    notification = {
      android_config: { category: 'ding' },
      data: { device: { id: camera.id } },
    },
    envelope: Parameters<NotificationListener>[0] = {
      persistentId: 'test-push',
      message: {
        data: {
          android_config: JSON.stringify(notification.android_config),
          data: JSON.stringify(notification.data),
        },
      },
    },
    startupMessage =
      'Ignoring push notification received in first two seconds after starting up'

  beforeEach(async () => {
    // Reset the module-scoped debug flag so each test starts with debug off.
    vi.resetModules()
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(0)
    receiver.connect.mockResolvedValue(undefined)

    const { RingApi: Api } = await import('../api.ts'),
      { useLogger } = await import('../util.ts')
    useLogger(logger)
    api = new Api({ refreshToken: 'test-refresh', systemId: 'test-system' })
    vi.spyOn(api.restClient, 'request').mockResolvedValue({
      responseTimestamp: 0,
      timeMillis: 0,
    })
    await (api as any).registerPushReceiver([camera], [])
    notify = receiver.onNotification.mock.calls[0][0]
  })

  afterEach(() => {
    api.disconnect()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps a startup burst quiet with debug disabled', () => {
    for (let i = 0; i < 65; i++) {
      notify(envelope)
    }

    expect(logger.logInfo).not.toHaveBeenCalled()
    expect(logger.logError).not.toHaveBeenCalled()
    expect(camera.processPushNotification).not.toHaveBeenCalled()
  })

  it('retains per-notification diagnostics with debug enabled', async () => {
    const { enableDebug } = await import('../util.ts')
    enableDebug()

    for (let i = 0; i < 65; i++) {
      notify(envelope)
    }

    expect(logger.logInfo).toHaveBeenCalledTimes(65)
    expect(logger.logInfo).toHaveBeenCalledWith(startupMessage)
    expect(camera.processPushNotification).not.toHaveBeenCalled()
  })

  it('preserves the two-second discard boundary and later delivery', () => {
    vi.setSystemTime(1999)
    notify(envelope)
    expect(camera.processPushNotification).not.toHaveBeenCalled()

    vi.setSystemTime(2000)
    notify(envelope)
    expect(camera.processPushNotification).toHaveBeenCalledExactlyOnceWith(
      notification,
    )
    expect(logger.logInfo).not.toHaveBeenCalled()
  })

  it('keeps handler failures visible with debug disabled', () => {
    const error = new Error('synthetic handler failure')
    camera.processPushNotification.mockImplementationOnce(() => {
      throw error
    })

    vi.setSystemTime(2000)
    notify(envelope)

    expect(logger.logError).toHaveBeenCalledExactlyOnceWith(error)
    expect(logger.logInfo).not.toHaveBeenCalled()
  })

  it('keeps receiver warnings visible with debug disabled', async () => {
    const { default: receiverLogger } = await import(
        '@eneris/push-receiver/dist/utils/logger.js'
      ),
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    ;(receiverLogger.default || receiverLogger).warn('synthetic warning')

    expect(warn).toHaveBeenCalledExactlyOnceWith('synthetic warning')
  })
})
