import {
  ActiveDing,
  batteryCameraKinds,
  CameraData,
  CameraEventOptions,
  CameraEventResponse,
  CameraHealth,
  DoorbellType,
  HistoryOptions,
  RingCameraModel,
  SnapshotTimestamp,
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
import { createSocket } from 'dgram'
import { bindToPort, getPublicIp, reservePorts, SrtpOptions } from './rtp-utils'
import { delay, logError, logInfo } from './util'
import { FfmpegOptions, SipSession } from './sip-session'
import { SipOptions } from './sip-call'

const snapshotRefreshDelay = 500,
  maxSnapshotRefreshSeconds = 30,
  maxSnapshotRefreshAttempts =
    (maxSnapshotRefreshSeconds * 1000) / snapshotRefreshDelay

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

export class RingCamera {
  id = this.initialData.id
  deviceType = this.initialData.kind
  model = RingCameraModel[this.initialData.kind] || 'Unknown Model'
  onData = new BehaviorSubject<CameraData>(this.initialData)
  hasLight = this.initialData.led_status !== undefined
  hasSiren = this.initialData.siren_status !== undefined
  hasBattery =
    batteryCameraKinds.includes(this.deviceType) ||
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

    const state = on ? 'on' : 'off'

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl('siren_' + state),
    })

    this.updateData({ ...this.data, siren_status: { seconds_remaining: 1 } })

    return true
  }

  // Enable or disable the in-home doorbell (if digital or mechanical)
  async setInHomeDoorbell(on: boolean) {
    if (!this.hasInHomeDoorbell) {
      return false
    }

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl(),
      data: {
        'doorbot[settings][chime_settings][enable]': on,
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
    return this.restClient.request<ActiveDing | ''>({
      method: 'POST',
      url: this.doorbotUrl('live_view'), // Ring app uses vod for battery cams, but doesn't appear to be necessary
    })
  }

  private pollForActiveDing() {
    // try every second until a new ding is received
    interval(1000)
      .pipe(takeUntil(this.onNewDing))
      .subscribe(() => {
        this.onRequestActiveDings.next()
      })
  }

  private expiredDingIds: string[] = []
  async getSipConnectionDetails() {
    const vodPromise = this.onNewDing.pipe(take(1)).toPromise(),
      videoOnDemandDing = await this.startVideoOnDemand()

    if (
      videoOnDemandDing &&
      'sip_from' in videoOnDemandDing &&
      !this.expiredDingIds.includes(videoOnDemandDing.id_str)
    ) {
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

    this.onNewDing.next(ding)
    this.onActiveDings.next(
      activeDings.filter((d) => d.id_str !== dingId).concat([ding])
    )

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

  private async getSnapshotTimestamp() {
    const { timestamps, responseTimestamp } = await this.restClient.request<{
        timestamps: SnapshotTimestamp[]
      }>({
        url: clientApi('snapshots/timestamps'),
        method: 'POST',
        data: {
          doorbot_ids: [this.id],
        },
        json: true,
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
  private snapshotLifeTime = (this.hasBattery ? 600 : 30) * 1000 // battery cams only refresh timestamp every 10 minutes
  private lastSnapshotTimestampLocal = 0
  private lastSnapshotPromise?: Promise<Buffer>

  private async refreshSnapshot() {
    const currentTimestampAge = Date.now() - this.lastSnapshotTimestampLocal
    if (this.isTimestampInLifeTime(currentTimestampAge)) {
      logInfo(
        `Snapshot for ${this.name} is still within its life time (${
          currentTimestampAge / 1000
        }s old)`
      )
      return true
    }

    for (let i = 0; i < maxSnapshotRefreshAttempts; i++) {
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

    throw new Error(
      `Snapshot failed to refresh after ${maxSnapshotRefreshAttempts} attempts`
    )
  }

  async getSnapshot(allowStale = false) {
    this.refreshSnapshotInProgress =
      this.refreshSnapshotInProgress || this.refreshSnapshot()

    try {
      const useLastSnapshot = await this.refreshSnapshotInProgress

      if (useLastSnapshot && this.lastSnapshotPromise) {
        this.refreshSnapshotInProgress = undefined
        return this.lastSnapshotPromise
      }
    } catch (e) {
      logError(e.message)
      if (!allowStale) {
        throw e
      }
    }

    this.refreshSnapshotInProgress = undefined

    this.lastSnapshotPromise = this.restClient.request<Buffer>({
      url: clientApi(`snapshots/image/${this.id}`),
      responseType: 'arraybuffer',
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

    if (this.expiredDingIds.includes(ding.id_str)) {
      logInfo('Waiting for a new live stream to start...')
      await delay(500)
      return this.getSipOptions()
    }

    return {
      to: ding.sip_to,
      from: ding.sip_from,
      dingId: ding.id_str,
    }
  }

  getUpdatedSipOptions(expiredDingId: string) {
    // Got a 480 from sip session, which means it's no longer active
    this.expiredDingIds.push(expiredDingId)
    return this.getSipOptions()
  }

  async createSipSession(
    srtpOption: { audio?: SrtpOptions; video?: SrtpOptions } = {}
  ) {
    const videoSocket = createSocket('udp4'),
      audioSocket = createSocket('udp4'),
      [
        sipOptions,
        publicIpPromise,
        videoPort,
        audioPort,
        [tlsPort],
      ] = await Promise.all([
        this.getSipOptions(),
        getPublicIp(),
        bindToPort(videoSocket, { forExternalUse: true }),
        bindToPort(audioSocket, { forExternalUse: true }),
        reservePorts(),
      ]),
      rtpOptions = {
        address: await publicIpPromise,
        audio: {
          port: audioPort,
          ...srtpOption.audio,
        },
        video: {
          port: videoPort,
          ...srtpOption.video,
        },
      }

    return new SipSession(
      sipOptions,
      rtpOptions,
      videoSocket,
      audioSocket,
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
    // SOMEDAY: generate random SRTP key/salt
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
}

// SOMEDAY: extract image from video file?
// ffmpeg -i input.mp4 -r 1 -f image2 image-%2d.png
