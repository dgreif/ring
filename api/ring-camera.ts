import {
  ActiveDing,
  CameraData,
  CameraEventOptions,
  CameraEventResponse,
  CameraHealth,
  DoorbellType,
  HistoryOptions,
  isBatteryCameraKind,
  PeriodicFootageResponse,
  RingCameraModel,
  SnapshotTimestamp,
  VideoSearchResponse,
} from './ring-types'
import { clientApi, RingRestClient } from './rest-client'
import { BehaviorSubject, interval, Subject } from 'rxjs'
import {
  distinctUntilChanged,
  filter,
  map,
  publishReplay,
  refCount,
  share,
  take,
  takeUntil,
} from 'rxjs/operators'
import {
  generateSrtpOptions,
  getDefaultIpAddress,
  isFfmpegInstalled,
  reservePorts,
  RtpSplitter,
  SrtpOptions,
} from '@homebridge/camera-utils'
import { delay, logError, logInfo } from './util'
import { FfmpegOptions, SipSession } from './sip-session'
import { SipOptions } from './sip-call'
import { Subscribed } from './subscribed'

const snapshotRefreshDelay = 500,
  maxSnapshotRefreshSeconds = 35, // needs to be 30+ because battery cam can't take snapshot while recording
  maxSnapshotRefreshAttempts =
    (maxSnapshotRefreshSeconds * 1000) / snapshotRefreshDelay,
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
  id = this.initialData.id
  deviceType = this.initialData.kind
  model = RingCameraModel[this.initialData.kind] || 'Unknown Model'
  onData = new BehaviorSubject<CameraData>(this.initialData)
  hasLight = this.initialData.led_status !== undefined
  hasSiren = this.initialData.siren_status !== undefined
  hasBattery =
    isBatteryCameraKind(this.deviceType) ||
    (typeof this.initialData.battery_life === 'string' &&
      this.batteryLevel !== null &&
      this.batteryLevel < 100 &&
      this.batteryLevel >= 0)

  onRequestUpdate = new Subject()
  onRequestActiveDings = new Subject()

  onNewDing = new Subject<ActiveDing>()
  onActiveDings = new BehaviorSubject<ActiveDing[]>([])
  onDoorbellPressed = this.onNewDing.pipe(
    filter((ding) => ding.kind === 'ding'),
    share()
  )
  onMotionDetected = this.onActiveDings.pipe(
    map((dings) => dings.some((ding) => ding.motion || ding.kind === 'motion')),
    distinctUntilChanged(),
    publishReplay(1),
    refCount()
  )
  onBatteryLevel = this.onData.pipe(
    map(getBatteryLevel),
    distinctUntilChanged()
  )
  onInHomeDoorbellStatus = this.onData.pipe(
    map(({ settings: { chime_settings } }: CameraData) => {
      return Boolean(chime_settings?.enable)
    }),
    distinctUntilChanged()
  )

  constructor(
    private initialData: CameraData,
    public isDoorbot: boolean,
    private restClient: RingRestClient
  ) {
    super()

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
    this.onRequestUpdate.next()
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

  get hasLowBattery() {
    return this.data.alerts.battery === 'low'
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

  // Enable or disable the in-home doorbell (if digital or mechanical)
  async setInHomeDoorbell(enable: boolean) {
    if (!this.hasInHomeDoorbell) {
      return false
    }

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl(),
      json: {
        doorbot: { settings: { chime_settings: { enable } } },
      },
    })

    this.requestUpdate()

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

  startVideoOnDemand() {
    return this.restClient
      .request<ActiveDing | ''>({
        method: 'POST',
        url: this.doorbotUrl('live_view'), // Ring app uses vod for battery cams, but doesn't appear to be necessary
      })
      .catch((e) => {
        if (e.response?.statusCode === 403) {
          const errorMessage = `Camera ${this.name} returned 403 when starting a live stream.  This usually indicates that live streaming is blocked by Modes settings.  Check your Ring app and verify that you are able to stream from this camera with the current Modes settings.`
          logError(errorMessage)
          throw new Error(errorMessage)
        }

        throw e
      })
  }

  private pollForActiveDing() {
    // try every second until a new ding is received
    this.addSubscriptions(
      interval(1000)
        .pipe(takeUntil(this.onNewDing))
        .subscribe(() => {
          this.onRequestActiveDings.next()
        })
    )
  }

  private expiredDingIds: string[] = []
  async getSipConnectionDetails() {
    const vodPromise = this.onNewDing.pipe(take(1)).toPromise(),
      videoOnDemandDing = await this.startVideoOnDemand()

    if (videoOnDemandDing && 'sip_from' in videoOnDemandDing) {
      // wired cams return a ding from live_view so we don't need to wait
      return videoOnDemandDing
    }

    // battery cams return '' from live_view so we need to request active dings and wait
    this.pollForActiveDing()
    return vodPromise
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
      this.expiredDingIds = this.expiredDingIds.filter((id) => id !== dingId)
    }, 65 * 1000) // dings last ~1 minute
  }

  getEvents(options: CameraEventOptions) {
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

  private async getSnapshotTimestamp() {
    const { timestamps, responseTimestamp } = await this.restClient.request<{
        timestamps: SnapshotTimestamp[]
      }>({
        url: clientApi('snapshots/timestamps'),
        method: 'POST',
        json: {
          doorbot_ids: [this.id],
        },
      }),
      deviceTimestamp = timestamps[0],
      timestamp = deviceTimestamp ? deviceTimestamp.timestamp : 0,
      timestampAge = Math.abs(responseTimestamp - timestamp)

    this.lastSnapshotTimestampLocal = timestamp ? Date.now() - timestampAge : 0

    return {
      timestamp,
      inLifeTime: this.isTimestampInLifeTime(timestampAge),
    }
  }

  private refreshSnapshotInProgress?: Promise<boolean>
  public readonly snapshotLifeTime = 10 * 1000
  private lastSnapshotTimestampLocal = 0
  private lastSnapshotPromise?: Promise<Buffer>

  get currentTimestampAge() {
    return Date.now() - this.lastSnapshotTimestampLocal
  }

  get currentTimestampExpiresIn() {
    // Gets 0 if stale snapshot is used because snapshot timestamp refused to update (recording in progress on battery cam)
    return Math.max(
      this.lastSnapshotTimestampLocal - Date.now() + this.snapshotLifeTime,
      0
    )
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
  }

  private requestSnapshotUpdate() {
    return this.restClient.request({
      method: 'PUT',
      url: clientApi('snapshots/update_all'),
      json: {
        doorbot_ids: [this.id],
        refresh: true,
      },
    })
  }

  private async refreshSnapshot() {
    if (this.hasSnapshotWithinLifetime) {
      logInfo(
        `Snapshot for ${this.name} is still within its life time (${
          this.currentTimestampAge / 1000
        }s old)`
      )
      return true
    }

    this.checkIfSnapshotsAreBlocked()
    await this.requestSnapshotUpdate()

    for (let i = 0; i < maxSnapshotRefreshAttempts; i++) {
      this.checkIfSnapshotsAreBlocked()

      const { timestamp, inLifeTime } = await this.getSnapshotTimestamp()

      if (!timestamp && this.isOffline) {
        throw new Error(
          `No snapshot available and device ${this.name} is offline`
        )
      }

      if (inLifeTime) {
        return false
      }

      await delay(snapshotRefreshDelay)
    }

    const extraMessageForBatteryCam = this.hasBattery
      ? '.  This is normal behavior since this camera is unable to capture snapshots while streaming'
      : ''
    throw new Error(
      `Snapshot for ${this.name} failed to refresh after ${maxSnapshotRefreshAttempts} attempts${extraMessageForBatteryCam}`
    )
  }

  async getSnapshot() {
    this.refreshSnapshotInProgress =
      this.refreshSnapshotInProgress ||
      this.refreshSnapshot().catch((e) => {
        logError(e.message)
        throw e
      })

    try {
      const useLastSnapshot = await this.refreshSnapshotInProgress
      this.refreshSnapshotInProgress = undefined

      if (useLastSnapshot && this.lastSnapshotPromise) {
        return this.lastSnapshotPromise
      }
    } catch (e) {
      this.refreshSnapshotInProgress = undefined
      throw e
    }

    this.lastSnapshotPromise = this.restClient.request<Buffer>({
      url: clientApi(`snapshots/image/${this.id}`),
      responseType: 'buffer',
    })

    this.lastSnapshotPromise.catch(() => {
      // snapshot request failed, don't use it again
      this.lastSnapshotPromise = undefined
    })

    return this.lastSnapshotPromise
  }

  async getSipOptions(): Promise<SipOptions> {
    const activeDings = this.onActiveDings.getValue(),
      existingDing = activeDings
        .filter((ding) => !this.expiredDingIds.includes(ding.id_str))
        .slice()
        .reverse()[0],
      ding = existingDing || (await this.getSipConnectionDetails())

    return {
      to: ding.sip_to,
      from: ding.sip_from,
      dingId: ding.id_str,
      localIp: await getDefaultIpAddress(),
    }
  }

  getUpdatedSipOptions(expiredDingId: string) {
    // Got a 480 from sip session, which means it's no longer active
    this.expiredDingIds.push(expiredDingId)
    return this.getSipOptions()
  }

  async createSipSession(
    options: {
      audio?: SrtpOptions
      video?: SrtpOptions
      skipFfmpegCheck?: boolean
    } = {}
  ) {
    const videoSplitter = new RtpSplitter(),
      audioSplitter = new RtpSplitter(),
      [
        sipOptions,
        ffmpegIsInstalled,
        videoPort,
        audioPort,
        [tlsPort],
      ] = await Promise.all([
        this.getSipOptions(),
        options.skipFfmpegCheck ? Promise.resolve(true) : isFfmpegInstalled(),
        videoSplitter.portPromise,
        audioSplitter.portPromise,
        reservePorts(),
      ]),
      rtpOptions = {
        audio: {
          port: audioPort,
          ...(options.audio || generateSrtpOptions()),
        },
        video: {
          port: videoPort,
          ...(options.video || generateSrtpOptions()),
        },
      }

    if (!ffmpegIsInstalled) {
      throw new Error(
        'Ffmpeg is not installed.  See https://github.com/dgreif/ring/wiki/FFmpeg for directions.'
      )
    }

    return new SipSession(
      sipOptions,
      rtpOptions,
      videoSplitter,
      audioSplitter,
      tlsPort,
      this
    )
  }

  async recordToFile(outputPath: string, duration = 30) {
    const sipSession = await this.streamVideo({
      output: ['-t', duration.toString(), outputPath],
    })

    await sipSession.onCallEnded.pipe(take(1)).toPromise()
  }

  async streamVideo(ffmpegOptions: FfmpegOptions) {
    const sipSession = await this.createSipSession()
    await sipSession.start(ffmpegOptions)
    return sipSession
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

// SOMEDAY: extract image from video file?
// ffmpeg -i input.mp4 -r 1 -f image2 image-%2d.png
