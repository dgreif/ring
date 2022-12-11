import {
  IntercomHandsetAudioData,
  PushNotification,
  PushNotificationAction,
} from './ring-types'
import { clientApi, commandsApi, RingRestClient } from './rest-client'
import { BehaviorSubject, Subject } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { getBatteryLevel } from './ring-camera'
import { logError } from './util'

export class RingIntercom {
  id
  deviceType
  onData
  onRequestUpdate = new Subject()
  onBatteryLevel
  onDing = new Subject<void>()
  onUnlocked = new Subject<void>()

  constructor(
    private initialData: IntercomHandsetAudioData,
    private restClient: RingRestClient
  ) {
    this.id = this.initialData.id
    this.deviceType = this.initialData.kind
    this.onData = new BehaviorSubject<IntercomHandsetAudioData>(
      this.initialData
    )

    this.onBatteryLevel = this.onData.pipe(
      map((data) => getBatteryLevel(data)),
      distinctUntilChanged()
    )

    if (!initialData.subscribed) {
      this.subscribeToDingEvents().catch((e) => {
        logError(
          'Failed to subscribe ' + initialData.description + ' to ding events'
        )
        logError(e)
      })
    }
  }

  updateData(update: IntercomHandsetAudioData) {
    this.onData.next(update)
  }

  requestUpdate() {
    this.onRequestUpdate.next(null)
  }

  get data() {
    return this.onData.getValue()
  }

  get name() {
    return this.data.description
  }

  get isOffline() {
    return this.data.alerts.connection === 'offline'
  }

  get batteryLevel() {
    return getBatteryLevel(this.data)
  }

  unlock() {
    return this.restClient.request<unknown>({
      method: 'PUT',
      url: commandsApi(`devices/${this.id}/device_rpc`),
      json: {
        command_name: 'device_rpc',
        request: {
          jsonrpc: '2.0',
          method: 'unlock_door',
          params: {
            door_id: 0,
            user_id: 0,
          },
        },
      },
    })
  }

  private doorbotUrl(path = '') {
    return clientApi(`doorbots/${this.id}/${path}`)
  }

  subscribeToDingEvents() {
    return this.restClient.request({
      method: 'POST',
      url: this.doorbotUrl('subscribe'),
    })
  }

  unsubscribeFromDingEvents() {
    return this.restClient.request({
      method: 'POST',
      url: this.doorbotUrl('unsubscribe'),
    })
  }

  processPushNotification(notification: PushNotification) {
    if (notification.action === PushNotificationAction.Ding) {
      this.onDing.next()
    } else if (notification.action === PushNotificationAction.IntercomUnlock) {
      this.onUnlocked.next()
    }
  }
}
