import {
  ActiveDing,
  CameraData,
  CameraDeviceSettingsData,
  CameraEventOptions,
  CameraEventResponse,
  CameraHealth,
  DoorbellType,
  HistoryOptions,
  isBatteryCameraKind,
  LiveCallResponse,
  PeriodicFootageResponse,
  RingCameraModel,
  VideoSearchResponse,
} from './ring-types'
import { clientApi, deviceApi, RingRestClient } from './rest-client'
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs'
import {
  distinctUntilChanged,
  filter,
  map,
  mapTo,
  publishReplay,
  refCount,
  share,
} from 'rxjs/operators'
import { DeepPartial, delay, logDebug, logError } from './util'
import { Subscribed } from './subscribed'
import { FfmpegOptions, LiveCall } from './live-call'

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
  data: Pick<CameraData, 'battery_life' | 'battery_life_2'>
) {
  const levels = [
    parseBatteryLife(data.battery_life),
    parseBatteryLife(data.battery_life_2),
  ].filter((level): level is number => level !== null)

  if (!levels.length) {
    return null
  }

  return Math.min(...levels)
}

export function getSearchQueryString(
  options: CameraEventOptions | (HistoryOptions & { accountId: string })
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

export class RingCamera extends Subscribed {
  id
  deviceType
  model
  onData
  hasLight
  hasSiren

  onRequestUpdate = new Subject()
  onRequestActiveDings = new Subject()

  onNewDing = new Subject<ActiveDing>()
  onActiveDings = new BehaviorSubject<ActiveDing[]>([])
  onDoorbellPressed = this.onNewDing.pipe(
    filter(
      (ding) =>
        ding.kind === 'ding' ||
        (this.treatKnockAsDing && ding.kind === 'door_activity')
    ),
    share()
  )
  onMotionDetected = this.onActiveDings.pipe(
    map((dings) => dings.some((ding) => ding.motion || ding.kind === 'motion')),
    distinctUntilChanged(),
    publishReplay(1),
    refCount()
  )
  onMotionStarted = this.onMotionDetected.pipe(
    filter((currentlyDetected) => currentlyDetected),
    mapTo(null), // no value needed, event is what matters
    share()
  )
  onBatteryLevel
  onInHomeDoorbellStatus

  constructor(
    private initialData: CameraData,
    public isDoorbot: boolean,
    private restClient: RingRestClient,
    private avoidSnapshotBatteryDrain: boolean,
    private treatKnockAsDing: boolean
  ) {
    super()

    this.id = this.initialData.id
    this.deviceType = this.initialData.kind
    this.model = RingCameraModel[this.initialData.kind] || 'Unknown Model'
    this.onData = new BehaviorSubject<CameraData>(this.initialData)
    this.hasLight = this.initialData.led_status !== undefined
    this.hasSiren = this.initialData.siren_status !== undefined

    this.onBatteryLevel = this.onData.pipe(
      map(getBatteryLevel),
      distinctUntilChanged()
    )
    this.onInHomeDoorbellStatus = this.onData.pipe(
      map(({ settings: { chime_settings } }: CameraData) => {
        return Boolean(chime_settings?.enable)
      }),
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

    if (!initialData.subscribed_motions) {
      this.subscribeToMotionEvents().catch((e) => {
        logError(
          'Failed to subscribe ' + initialData.description + ' to motion events'
        )
        logError(e)
      })
    }
  }

  updateData(update: CameraData) {
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

  get activeDings() {
    return this.onActiveDings.getValue()
  }

  get batteryLevel() {
    return getBatteryLevel(this.data)
  }

  get hasBattery() {
    if (this.batteryLevel === null) {
      return false
    }

    return (
      isBatteryCameraKind(this.deviceType) ||
      (typeof this.initialData.battery_life === 'string' &&
        this.batteryLevel < 100 &&
        this.batteryLevel >= 0)
    )
  }

  get hasLowBattery() {
    return this.data.alerts.battery === 'low'
  }

  get isCharging() {
    return this.initialData.external_connection
  }

  get operatingOnBattery() {
    return this.hasBattery && this.data.settings.power_mode !== 'wired'
  }

  get isOffline() {
    return this.data.alerts.connection === 'offline'
  }

  get hasInHomeDoorbell() {
    const { chime_settings } = this.data.settings

    return (
      this.isDoorbot &&
      Boolean(
        chime_settings &&
          [DoorbellType.Mechanical, DoorbellType.Digital].includes(
            chime_settings.type
          )
      )
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

    this.updateData({ ...this.data, siren_status: { seconds_remaining: 1 } })

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
    const response = await this.restClient.request<{
      device_health: CameraHealth
    }>({
      url: this.doorbotUrl('health'),
    })

    return response.device_health
  }

  async startLiveCallNegotiation() {
    try {
      const liveCall = await this.restClient.request<LiveCallResponse>({
        method: 'POST',
        url: this.doorbotUrl('live_call'),
      })

      return liveCall.data.session_id
    } catch (e: any) {
      if (e.response?.statusCode === 403) {
        const errorMessage = `Camera ${this.name} returned 403 when starting a live stream.  This usually indicates that live streaming is blocked by Modes settings.  Check your Ring app and verify that you are able to stream from this camera with the current Modes settings.`
        logError(errorMessage)
        throw new Error(errorMessage)
      }

      throw e
    }
  }

  async startLiveCall() {
    return new LiveCall(await this.startLiveCallNegotiation(), this)
  }

  private removeDingById(idToRemove: string) {
    const allActiveDings = this.activeDings,
      otherDings = allActiveDings.filter((ding) => ding.id_str !== idToRemove)

    this.onActiveDings.next(otherDings)
  }

  processActiveDing(ding: ActiveDing) {
    const activeDings = this.activeDings,
      dingId = ding.id_str

    this.onActiveDings.next(
      activeDings.filter((d) => d.id_str !== dingId).concat([ding])
    )
    this.onNewDing.next(ding)

    setTimeout(() => {
      this.removeDingById(ding.id_str)
    }, 65 * 1000) // dings last ~1 minute
  }

  getEvents(options: CameraEventOptions = {}) {
    return this.restClient.request<CameraEventResponse>({
      url: clientApi(
        `locations/${this.data.location_id}/devices/${
          this.id
        }/events${getSearchQueryString(options)}`
      ),
    })
  }

  videoSearch(
    { dateFrom, dateTo, order = 'asc' } = {
      dateFrom: getStartOfToday(),
      dateTo: getEndOfToday(),
    }
  ) {
    return this.restClient.request<VideoSearchResponse>({
      url: clientApi(
        `video_search/history?doorbot_id=${this.id}&date_from=${dateFrom}&date_to=${dateTo}&order=${order}&api_version=11&includes%5B%5D=pva`
      ),
    })
  }

  getPeriodicalFootage(
    { startAtMs, endAtMs } = {
      startAtMs: getStartOfToday(),
      endAtMs: getEndOfToday(),
    }
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
        `Motion detection is disabled for ${this.name}, which prevents snapshots from this camera.  This can be caused by Modes settings or by turning off the Record Motion setting.`
      )
    }

    if (this.isOffline) {
      throw new Error(
        `Cannot fetch snapshot for ${this.name} because it is offline`
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
        }s old)`
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
  async getSnapshot() {
    if (this.lastSnapshotPromise && this.shouldUseExistingSnapshotPromise()) {
      return this.lastSnapshotPromise
    }

    this.checkIfSnapshotsAreBlocked()

    this.lastSnapshotPromise = Promise.race([
      this.getNextSnapshot({
        afterMs: this.lastSnapshotTimestamp,
        force: true,
      }),
      delay(maxSnapshotRefreshSeconds * 1000).then(() => {
        const extraMessageForBatteryCam = this.operatingOnBattery
          ? '.  This is normal behavior since this camera is unable to capture snapshots while streaming'
          : ''
        throw new Error(
          `Snapshot for ${this.name} (${this.deviceType} - ${this.model}) failed to refresh after ${maxSnapshotRefreshSeconds} seconds${extraMessageForBatteryCam}`
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
  }: {
    afterMs?: number
    maxWaitMs?: number
    force?: boolean
  }) {
    const response = await this.restClient.request<Buffer>({
        url: `https://app-snaps.ring.com/snapshots/next/${this.id}?extras=force`,
        responseType: 'buffer',
        searchParams: {
          'after-ms': afterMs,
          'max-wait-ms': maxWaitMs,
          extras: force ? 'force' : undefined,
        },
        headers: {
          accept: 'image/jpeg',
        },
      }),
      { responseTimestamp, timeMillis } = response,
      timestampAge = Math.abs(responseTimestamp - timeMillis)

    this.lastSnapshotTimestamp = timeMillis
    this.lastSnapshotTimestampLocal = Date.now() - timestampAge
    return response
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

  async startWebRtcSession(session_uuid: string, sdp: string): Promise<string> {
    const response = await this.restClient.request<any>({
      method: 'POST',
      url: 'https://api.ring.com/integrations/v1/liveview/start',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: session_uuid,
        device_id: this.id,
        sdp: sdp,
        protocol: 'webrtc',
      }),
    })
    return response.sdp
  }

  async endWebRtcSession(session_uuid: string): Promise<string> {
    const response = await this.restClient.request<any>({
      method: 'POST',
      url: 'https://api.ring.com/integrations/v1/liveview/end',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: session_uuid,
      }),
    })
    return response.sdp
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
