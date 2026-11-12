import type { SocketTicketResponse } from './ring-types.ts'
import { RingCameraKind } from './ring-types.ts'
import {
  type CameraData,
  type CameraDeviceSettingsData,
  type CameraEventOptions,
  type CameraEventResponse,
  type EventHistoryResponse,
  type CameraHealth,
  DoorbellType,
  type HistoryOptions,
  type PeriodicFootageResponse,
  PushNotificationAction,
  type PushNotificationDingV2,
  RingCameraModel,
  type VideoSearchResponse,
  type OnvifCameraData,
  type PushNotification,
} from './ring-types.ts'
import type { RingRestClient } from './rest-client.ts'
import {
  appApi,
  clientApi,
  deviceApi,
  deviceInfoApi,
  evmApi,
} from './rest-client.ts'
import { BehaviorSubject, firstValueFrom, ReplaySubject, Subject } from 'rxjs'
import {
  distinctUntilChanged,
  filter,
  map,
  share,
  startWith,
  throttleTime,
} from 'rxjs/operators'
import {
  buildSearchString,
  type DeepPartial,
  delay,
  logDebug,
  logError,
} from './util.ts'
import { Subscribed } from './subscribed.ts'
import type { StreamingConnectionOptions } from './streaming/webrtc-connection.ts'
import { WebrtcConnection } from './streaming/webrtc-connection.ts'
import type { FfmpegOptions } from './streaming/streaming-session.ts'
import { StreamingSession } from './streaming/streaming-session.ts'
import { SimpleWebRtcSession } from './streaming/simple-webrtc-session.ts'

export type AnyCameraData = CameraData | OnvifCameraData

const maxSnapshotRefreshSeconds = 15,
  fullDayMs = 24 * 60 * 60 * 1000

function parseBatteryLife(batteryLife: string | number | null | undefined) {
  if (batteryLife === null || batteryLife === undefined) {
    return null
  }

  const batteryLevel =
    typeof batteryLife === 'number'
      ? batteryLife
      : Number.parseFloat(batteryLife)

  if (isNaN(batteryLevel)) {
    return null
  }

  return batteryLevel
}

function getStartOfToday() {
  return new Date(new Date().toLocaleDateString()).getTime()
}

function getEndOfToday() {
  return getStartOfToday() + fullDayMs - 1
}

export function getBatteryLevel(
  data: Pick<CameraData, 'battery_life' | 'battery_life_2'> & {
    health?: Partial<CameraData['health']>
  },
) {
  const levels = [
      parseBatteryLife(data.battery_life),
      parseBatteryLife(data.battery_life_2),
    ].filter((level): level is number => level !== null),
    { health } = data

  if (
    !levels.length ||
    (health &&
      !health.battery_percentage &&
      !health.battery_present &&
      !health.second_battery_percentage)
  ) {
    return null
  }

  return Math.min(...levels)
}

// Matches the timestamp format used by the legacy health endpoints
// (ex. 2026-08-25T23:01:14+00:00)
function formatHealthUpdatedAt(lastUpdateTime: number | undefined) {
  const updatedAt = lastUpdateTime
    ? new Date(lastUpdateTime * 1000)
    : new Date()

  return updatedAt.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

// The legacy clients_api health endpoint only works for devices owned by the
// authenticated account, returning a 404 for shared devices, so health is
// instead derived from the health data included with the device data
export function mapCameraHealth(
  id: number,
  health: Partial<CameraData['health']> | undefined,
): CameraHealth | undefined {
  if (!health || !Object.keys(health).length) {
    // Some device types (chimes, for example) have no health data in the
    // device_info api and must continue to use the legacy health endpoint
    return undefined
  }

  const { rssi, rssi_category: rssiCategory, ...rest } = health

  return {
    id,
    wifi_name: rest.wifi_name,
    battery_percentage: rest.battery_percentage,
    battery_percentage_category: rest.battery_percentage_category ?? 'unknown',
    battery_voltage: rest.battery_voltage ?? null,
    battery_voltage_category: rest.battery_voltage_category ?? null,
    latest_signal_strength: rssi ?? null,
    latest_signal_category: rssiCategory ?? 'NA',
    average_signal_strength: rssi ?? null,
    average_signal_category: rssiCategory ?? 'NA',
    firmware: rest.firmware_version_status ?? rest.firmware_version ?? '',
    updated_at: formatHealthUpdatedAt(rest.last_update_time),
    wifi_is_ring_network: rest.wifi_is_ring_network,
    packet_loss_category: rest.packet_loss_category ?? 'NA',
    packet_loss_strength: rest.packet_loss ?? null,
    network_connection: rest.network_connection_value,
    transformer_voltage: rest.transformer_voltage,
    transformer_voltage_category: rest.transformer_voltage_category,
    ext_power_state: rest.ext_power_state,
  }
}

// The evm history api replaces the legacy clients_api events endpoints, which
// return a 404 for devices that are shared with, but not owned by, this account
export function getEventHistory(
  restClient: RingRestClient,
  sourceIds: (string | number)[],
  options: CameraEventOptions = {},
) {
  const { limit, kind, state, favorites, olderThanId, pagination_key } =
      options,
    queryString = Object.entries({
      source_ids: sourceIds.join(','),
      limit,
      event_types: kind,
      state,
      favorites,
      pagination_key: pagination_key ?? olderThanId,
    })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&')

  return restClient
    .request<EventHistoryResponse>({
      url: evmApi(`history/devices?${queryString}`),
    })
    .then(
      ({ events, pagination_key: paginationKey }): CameraEventResponse => ({
        events: (events ?? []).map((event) => ({
          ...event,
          created_at: event.start_time,
          cv_properties: event.cv,
          ding_id: Number(event.event_id),
          ding_id_str: event.event_id,
          doorbot_id: Number(event.source_id),
          favorite: event.is_favorite,
          kind: event.event_type,
          recorded: event.recording_status === 'ready',
        })),
        meta: { pagination_key: paginationKey },
        pagination_key: paginationKey,
      }),
    )
}

export function getSearchQueryString(
  options: CameraEventOptions | (HistoryOptions & { accountId: string }),
) {
  const queryString = Object.entries(options)
    .map(([key, value]) => {
      if (value === undefined) {
        return ''
      }

      if (key === 'olderThanId') {
        key = 'pagination_key'
      }

      return `${key}=${value}`
    })
    .filter((x) => x)
    .join('&')

  return queryString.length ? `?${queryString}` : ''
}

export function cleanSnapshotUuid(uuid?: string | null) {
  if (!uuid) {
    return uuid
  }

  return uuid.replace(/:.*$/, '')
}

const wiredModelsWithNoSnapshotDuringRecording = new Set<RingCameraKind>([
    RingCameraKind.doorbell_graham_cracker,
  ]),
  enabledDoorbellTypes = new Set<DoorbellType>([
    DoorbellType.Mechanical,
    DoorbellType.Digital,
  ])

export class RingCamera extends Subscribed {
  id
  deviceType
  model
  onData
  hasLight
  hasSiren

  onRequestUpdate = new Subject()
  onNewNotification = new Subject<PushNotificationDingV2>()
  onActiveNotifications = new BehaviorSubject<PushNotificationDingV2[]>([])
  onDoorbellPressed = this.onNewNotification.pipe(
    filter(
      (notification) =>
        notification.android_config.category === PushNotificationAction.Ding,
    ),
    share(),
  )
  onMotionDetected = this.onActiveNotifications.pipe(
    map((notifications) =>
      notifications.some(
        (notification) =>
          notification.android_config.category ===
          PushNotificationAction.Motion,
      ),
    ),
    distinctUntilChanged(),
    share({
      connector: () => new ReplaySubject(1),
      resetOnError: false,
      resetOnComplete: false,
      resetOnRefCountZero: false,
    }),
  )
  onMotionStarted = this.onMotionDetected.pipe(
    filter((currentlyDetected) => currentlyDetected),
    map(() => null), // no value needed, event is what matters
    share(),
  )
  onBatteryLevel
  onInHomeDoorbellStatus
  private initialData
  public isDoorbot
  private restClient
  private avoidSnapshotBatteryDrain

  constructor(
    initialData: AnyCameraData,
    isDoorbot: boolean,
    restClient: RingRestClient,
    avoidSnapshotBatteryDrain: boolean,
  ) {
    super()

    this.initialData = initialData
    this.isDoorbot = isDoorbot
    this.restClient = restClient
    this.avoidSnapshotBatteryDrain = avoidSnapshotBatteryDrain
    this.id = this.initialData.id
    this.deviceType = this.initialData.kind
    this.model =
      RingCameraModel[this.initialData.kind as RingCameraKind] ||
      'Unknown Model'
    this.onData = new BehaviorSubject<AnyCameraData>(this.initialData)
    this.hasLight = this.initialData.led_status !== undefined
    this.hasSiren = this.initialData.siren_status !== undefined

    this.onBatteryLevel = this.onData.pipe(
      map((data) => {
        if (!('battery_life' in data)) {
          return null
        }
        return getBatteryLevel(data)
      }),
      distinctUntilChanged(),
    )
    this.onInHomeDoorbellStatus = this.onData.pipe(
      map(({ settings: { chime_settings } }: AnyCameraData) => {
        return Boolean(chime_settings?.enable)
      }),
      distinctUntilChanged(),
    )

    this.addSubscriptions(
      this.restClient.onSession
        .pipe(startWith(undefined), throttleTime(1000)) // Force this to run immediately, but don't double run if a session is created due to these api calls
        .subscribe(() => {
          if (!this.canSubscribeToNotifications) {
            logDebug(
              initialData.description +
                ' is shared with this account without the device_alerts_manage operation, so it cannot be subscribed to ding/motion notifications',
            )
            return
          }

          this.subscribeToDingEvents().catch((e) => {
            logError(
              'Failed to subscribe ' +
                initialData.description +
                ' to ding events',
            )
            logError(e)
          })

          this.subscribeToMotionEvents().catch((e) => {
            logError(
              'Failed to subscribe ' +
                initialData.description +
                ' to motion events',
            )
            logError(e)
          })
        }),
    )
  }

  updateData(update: AnyCameraData) {
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

  get activeNotifications() {
    return this.onActiveNotifications.getValue()
  }

  get latestNotification(): PushNotificationDingV2 | undefined {
    const notifications = this.activeNotifications
    return notifications[notifications.length - 1]
  }

  get latestNotificationSnapshotUuid() {
    const notification = this.latestNotification
    return notification?.img?.snapshot_uuid
  }

  get batteryLevel() {
    if (!('battery_life' in this.data)) {
      return null
    }
    return getBatteryLevel(this.data)
  }

  get hasBattery() {
    return this.batteryLevel !== null
  }

  get hasLowBattery() {
    return this.data.alerts.battery === 'low'
  }

  get isCharging() {
    if (!('external_connection' in this.data)) {
      return false
    }
    return this.data.external_connection
  }

  get operatingOnBattery() {
    return this.hasBattery && this.data.settings.power_mode !== 'wired'
  }

  get canTakeSnapshotWhileRecording() {
    return (
      !this.operatingOnBattery &&
      !wiredModelsWithNoSnapshotDuringRecording.has(
        this.data.kind as RingCameraKind,
      )
    )
  }

  get isOffline() {
    return this.data.alerts.connection === 'offline'
  }

  // Operations this account is allowed to perform on the device.  Devices
  // shared by another account may allow only a subset, and the api answers
  // with a 404 for anything outside of it.  Undefined when the api did not
  // report an operation set, in which case no operation should be assumed
  // unavailable.
  canPerformOperation(operation: string) {
    const { operations } = this.data as CameraData

    return operations ? operations.includes(operation) : undefined
  }

  // device_alerts_manage is required to subscribe to ding/motion notifications
  get canSubscribeToNotifications() {
    return this.canPerformOperation('device_alerts_manage') !== false
  }

  get isRingEdgeEnabled() {
    return this.data.settings.sheila_settings.local_storage_enabled === true
  }

  get hasInHomeDoorbell() {
    const { chime_settings } = this.data.settings

    return (
      this.isDoorbot &&
      Boolean(chime_settings && enabledDoorbellTypes.has(chime_settings.type))
    )
  }

  doorbotUrl(path = '') {
    return clientApi(`doorbots/${this.id}/${path}`)
  }

  deviceUrl(path = '') {
    return deviceApi(`devices/${this.id}/${path}`)
  }

  async setLight(on: boolean) {
    if (!this.hasLight) {
      return false
    }

    const state = on ? 'on' : 'off'

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl('floodlight_light_' + state),
    })

    this.updateData({ ...this.data, led_status: state })

    return true
  }

  async setSiren(on: boolean) {
    if (!this.hasSiren) {
      return false
    }

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl('siren_' + (on ? 'on' : 'off')),
    })

    const seconds = on ? 1 : 0

    this.updateData({
      ...this.data,
      siren_status: { seconds_remaining: seconds },
    })

    return true
  }

  async setSettings(settings: DeepPartial<CameraData['settings']>) {
    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl(),
      json: { doorbot: { settings } },
    })

    this.requestUpdate()
  }

  async setDeviceSettings(settings: DeepPartial<CameraDeviceSettingsData>) {
    const response = await this.restClient.request<CameraDeviceSettingsData>({
      method: 'PATCH',
      url: this.deviceUrl('settings'),
      json: settings,
    })

    this.requestUpdate()

    return response
  }

  getDeviceSettings() {
    return this.restClient.request<CameraDeviceSettingsData>({
      method: 'GET',
      url: this.deviceUrl('settings'),
    })
  }

  // Enable or disable the in-home doorbell (if digital or mechanical)
  async setInHomeDoorbell(enable: boolean) {
    if (!this.hasInHomeDoorbell) {
      return false
    }

    await this.setSettings({ chime_settings: { enable } })
    return true
  }

  async getHealth() {
    const { device } = await this.restClient.request<{
      device: { health?: Partial<CameraData['health']> }
    }>({
      url: deviceInfoApi(`devices/${this.id}`),
    })

    return mapCameraHealth(this.id, device.health)
  }

  private async createStreamingConnection(options: StreamingConnectionOptions) {
    const response = await this.restClient
      .request<SocketTicketResponse>({
        method: 'POST',
        url: appApi('clap/ticket/request/signalsocket'),
      })
      .catch((e) => {
        throw e
      })

    return new WebrtcConnection(response.ticket, this, options)
  }

  async startLiveCall(options: StreamingConnectionOptions = {}) {
    // Check if live view is disabled by camera settings/modes
    if (this.data.settings?.live_view_disabled === true) {
      throw new Error(
        `Live view is currently disabled for ${this.name}. This camera has been disabled via mode settings in the Ring app. Enable live view for this camera in the Ring app to start streaming.`,
      )
    }

    const connection = await this.createStreamingConnection(options)
    return new StreamingSession(this, connection)
  }

  private removeDingById(idToRemove: string) {
    const allActiveDings = this.activeNotifications,
      otherDings = allActiveDings.filter(
        ({ data }) => data.event.ding.id !== idToRemove,
      )

    this.onActiveNotifications.next(otherDings)
  }

  processPushNotification(notification: PushNotification) {
    if (
      !('android_config' in notification) ||
      !('event' in notification.data) ||
      !('ding' in (notification.data?.event ?? {}))
    ) {
      // only process ding/motion notifications
      return
    }

    const activeDings = this.activeNotifications,
      dingId = notification.data.event.ding.id

    this.onActiveNotifications.next(
      activeDings
        .filter((d) => d.data.event.ding.id !== dingId)
        .concat([notification]),
    )
    this.onNewNotification.next(notification)

    setTimeout(() => {
      this.removeDingById(dingId)
    }, 65 * 1000) // dings last ~1 minute
  }

  getEvents(options: CameraEventOptions = {}) {
    return getEventHistory(this.restClient, [this.id], options)
  }

  videoSearch(
    { dateFrom, dateTo, order = 'asc' } = {
      dateFrom: getStartOfToday(),
      dateTo: getEndOfToday(),
    },
  ) {
    return this.restClient.request<VideoSearchResponse>({
      url: clientApi(
        `video_search/history?doorbot_id=${this.id}&date_from=${dateFrom}&date_to=${dateTo}&order=${order}&api_version=11&includes%5B%5D=pva`,
      ),
    })
  }

  getPeriodicalFootage(
    { startAtMs, endAtMs } = {
      startAtMs: getStartOfToday(),
      endAtMs: getEndOfToday(),
    },
  ) {
    // These will be mp4 clips that are created using periodic snapshots
    return this.restClient.request<PeriodicFootageResponse>({
      url: `https://api.ring.com/recordings/public/footages/${this.id}?start_at_ms=${startAtMs}&end_at_ms=${endAtMs}&kinds=online_periodical&kinds=offline_periodical`,
    })
  }

  async getRecordingUrl(dingIdStr: string, { transcoded = false } = {}) {
    const path = transcoded ? 'recording' : 'share/play',
      response = await this.restClient.request<{ url: string }>({
        url: clientApi(`dings/${dingIdStr}/${path}?disable_redirect=true`),
      })
    return response.url
  }

  private isTimestampInLifeTime(timestampAge: number) {
    return timestampAge < this.snapshotLifeTime
  }

  public get snapshotsAreBlocked() {
    return this.data.settings.motion_detection_enabled === false
  }

  public get snapshotLifeTime() {
    return this.avoidSnapshotBatteryDrain && this.operatingOnBattery
      ? 600 * 1000 // battery cams only refresh timestamp every 10 minutes
      : 10 * 1000 // snapshot updates will be forced.  Limit to 10s lifetime
  }
  private lastSnapshotTimestamp = 0
  private lastSnapshotTimestampLocal = 0
  private lastSnapshotPromise?: Promise<Buffer>

  get currentTimestampAge() {
    return Date.now() - this.lastSnapshotTimestampLocal
  }

  get hasSnapshotWithinLifetime() {
    return this.isTimestampInLifeTime(this.currentTimestampAge)
  }

  private checkIfSnapshotsAreBlocked() {
    if (this.snapshotsAreBlocked) {
      throw new Error(
        `Motion detection is disabled for ${this.name}, which prevents snapshots from this camera.  This can be caused by Modes settings or by turning off the Record Motion setting.`,
      )
    }

    if (this.isOffline) {
      throw new Error(
        `Cannot fetch snapshot for ${this.name} because it is offline`,
      )
    }
  }

  private shouldUseExistingSnapshotPromise() {
    if (this.fetchingSnapshot) {
      return true
    }

    if (this.hasSnapshotWithinLifetime) {
      logDebug(
        `Snapshot for ${this.name} is still within its life time (${
          this.currentTimestampAge / 1000
        }s old)`,
      )
      return true
    }

    if (!this.avoidSnapshotBatteryDrain || !this.operatingOnBattery) {
      // tell the camera to update snapshot immediately.
      // avoidSnapshotBatteryDrain is best if you have a battery cam that you request snapshots for frequently.  This can lead to battery drain if snapshot updates are forced.
      return false
    }
  }

  private fetchingSnapshot = false
  async getSnapshot({ uuid }: { uuid?: string } = {}) {
    if (this.lastSnapshotPromise && this.shouldUseExistingSnapshotPromise()) {
      return this.lastSnapshotPromise
    }

    this.checkIfSnapshotsAreBlocked()

    this.lastSnapshotPromise = Promise.race([
      this.getNextSnapshot(
        uuid
          ? { uuid }
          : {
              afterMs: this.lastSnapshotTimestamp,
              force: true,
            },
      ),
      delay(maxSnapshotRefreshSeconds * 1000).then(() => {
        const extraMessageForBatteryCam = !this.canTakeSnapshotWhileRecording
          ? '.  This is normal behavior since this camera is unable to capture snapshots while streaming'
          : ''
        throw new Error(
          `Snapshot for ${this.name} (${this.deviceType} - ${this.model}) failed to refresh after ${maxSnapshotRefreshSeconds} seconds${extraMessageForBatteryCam}`,
        )
      }),
    ])

    try {
      await this.lastSnapshotPromise
    } catch (e) {
      // snapshot request failed, don't use it again
      this.lastSnapshotPromise = undefined
      throw e
    }
    this.fetchingSnapshot = false

    return this.lastSnapshotPromise
  }

  public async getNextSnapshot({
    afterMs,
    maxWaitMs,
    force,
    uuid,
  }: {
    afterMs?: number
    maxWaitMs?: number
    force?: boolean
    uuid?: string
  }) {
    const response = await this.restClient.request<Buffer>({
        url: `https://app-snaps.ring.com/snapshots/next/${
          this.id
        }${buildSearchString({
          'after-ms': afterMs,
          'max-wait-ms': maxWaitMs,
          extras: force ? 'force' : undefined,
          uuid: cleanSnapshotUuid(uuid),
        })}`,
        responseType: 'buffer',
        headers: {
          accept: 'image/jpeg',
        },
        allowNoResponse: true,
      }),
      { responseTimestamp, timeMillis } = response,
      timestampAge = Math.abs(responseTimestamp - timeMillis)

    this.lastSnapshotTimestamp = timeMillis
    this.lastSnapshotTimestampLocal = Date.now() - timestampAge
    return response
  }

  getSnapshotByUuid(uuid: string) {
    return this.restClient.request<Buffer>({
      url: clientApi('snapshots/uuid?uuid=' + cleanSnapshotUuid(uuid)),
      responseType: 'buffer',
      headers: {
        accept: 'image/jpeg',
      },
    })
  }

  async recordToFile(outputPath: string, duration = 30) {
    const liveCall = await this.streamVideo({
      output: ['-t', duration.toString(), outputPath],
    })

    await firstValueFrom(liveCall.onCallEnded)
  }

  async streamVideo(ffmpegOptions: FfmpegOptions) {
    const liveCall = await this.startLiveCall()
    await liveCall.startTranscoding(ffmpegOptions)
    return liveCall
  }

  /**
   * Returns a SimpleWebRtcSession, which can be initiated with an sdp offer.
   * This session has no backplane for trickle ICE, and is designed for use in a
   * browser setting.  Note, cameras with Ring Edge enabled will stream with the speaker
   * enabled as soon as the stream starts, which can drain the battery more quickly.
   */
  createSimpleWebRtcSession() {
    return new SimpleWebRtcSession(this, this.restClient)
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

  subscribeToMotionEvents() {
    return this.restClient.request({
      method: 'POST',
      url: this.doorbotUrl('motions_subscribe'),
    })
  }

  unsubscribeFromMotionEvents() {
    return this.restClient.request({
      method: 'POST',
      url: this.doorbotUrl('motions_unsubscribe'),
    })
  }

  disconnect() {
    this.unsubscribe()
  }
}
