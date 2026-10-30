import { vi } from 'vitest'

// Push notifications need real FCM credentials; tests drive
// processPushNotification directly instead
vi.mock('@eneris/push-receiver', () => ({
  PushReceiver: class {
    on() {
      return this
    }
    onCredentialsChanged() {
      return this
    }
    onNotification() {
      return this
    }
    connect() {
      return Promise.resolve()
    }
    whenReady = Promise.resolve()
  },
}))
