import {
  ActiveDing,
  CameraData,
  CameraHealth,
  HistoricalDingGlobal,
  RingCameraModel,
  batteryCameraKinds,
  SnapshotTimestamp
} from './ring-types'
import { clientApi, RingRestClient } from './rest-client'
import { BehaviorSubject, Subject } from 'rxjs'
import {
  distinctUntilChanged,
  filter,
  map,
  publishReplay,
  refCount,
  share,
  take
} from 'rxjs/operators'
import { createSocket } from 'dgram'
import { bindToRandomPort, getPublicIp } from './rtp-utils'
import { delay, logError } from './util'
import { SipSession, SrtpOptions } from './sip-session'

const getPort = require('get-port')

const snapshotRefreshDelay = 500,
  maxSnapshotRefreshSeconds = 30,
  maxSnapshotRefreshAttempts =
    (maxSnapshotRefreshSeconds * 1000) / snapshotRefreshDelay

function getBatteryLevel(data: CameraData) {
  const batteryLevel =
    typeof data.battery_life === 'number'
      ? data.battery_life
      : Number.parseFloat(data.battery_life)

  if (isNaN(batteryLevel)) {
    return null
  }

  return batteryLevel
}

export class RingCamera {
  id = this.initialData.id
  deviceType = this.initialData.kind
  model = RingCameraModel[this.initialData.kind] || 'Unknown Model'
  hasLight = this.initialData.led_status !== undefined
  hasSiren = this.initialData.siren_status !== undefined
  hasBattery = batteryCameraKinds.includes(this.deviceType)

  onData = new BehaviorSubject<CameraData>(this.initialData)
  onRequestUpdate = new Subject()
  onRequestActiveDings = new Subject()

  onNewDing = new Subject<ActiveDing>()
  onActiveDings = new BehaviorSubject<ActiveDing[]>([])
  onDoorbellPressed = this.onNewDing.pipe(
    filter(ding => ding.kind === 'ding'),
    share()
  )
  onMotionDetected = this.onActiveDings.pipe(
    map(dings => dings.some(ding => ding.motion || ding.kind === 'motion')),
    distinctUntilChanged(),
    publishReplay(1),
    refCount()
  )
  onBatteryLevel = this.onData.pipe(
    map(getBatteryLevel),
    distinctUntilChanged()
  )

  constructor(
    private initialData: CameraData,
    public isDoorbot: boolean,
    private restClient: RingRestClient
  ) {}

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

  doorbotUrl(path: string) {
    return clientApi(`doorbots/${this.id}/${path}`)
  }

  async setLight(on: boolean) {
    if (!this.hasLight) {
      return false
    }

    const state = on ? 'on' : 'off'

    await this.restClient.request({
      method: 'PUT',
      url: this.doorbotUrl('floodlight_light_' + state)
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
      url: this.doorbotUrl('siren_' + state)
    })

    this.updateData({ ...this.data, siren_status: { seconds_remaining: 1 } })

    return true
  }

  async getHealth() {
    const response = await this.restClient.request<{
      device_health: CameraHealth
    }>({
      url: this.doorbotUrl('health')
    })

    return response.device_health
  }

  startVideoOnDemand() {
    return this.restClient.request({
      method: 'POST',
      url: this.doorbotUrl('vod')
    })
  }

  async getSipConnectionDetails() {
    const vodPromise = this.onNewDing
      .pipe(
        filter(x => x.kind === 'on_demand'),
        take(1)
      )
      .toPromise()
    await this.startVideoOnDemand()
    this.onRequestActiveDings.next()
    return vodPromise
  }

  processActiveDing(ding: ActiveDing) {
    const activeDings = this.activeDings

    this.onNewDing.next(ding)
    this.onActiveDings.next(activeDings.concat([ding]))

    setTimeout(() => {
      const allActiveDings = this.activeDings,
        otherDings = allActiveDings.filter(oldDing => oldDing !== ding)
      this.onActiveDings.next(otherDings)
    }, 65 * 1000) // dings last ~1 minute
  }

  getHistory(limit = 10, favoritesOnly = false) {
    const favoritesParam = favoritesOnly ? '&favorites=1' : ''
    return this.restClient.request<HistoricalDingGlobal[]>({
      url: this.doorbotUrl(`history?limit=${limit}${favoritesParam}`)
    })
  }

  async getRecording(dingIdStr: string) {
    const response = await this.restClient.request<{ url: string }>({
      url: clientApi(`dings/${dingIdStr}/share/play?disable_redirect=true`)
    })
    return response.url
  }

  private async getTimestampAge() {
    const { timestamps, responseTimestamp } = await this.restClient.request<{
        timestamps: SnapshotTimestamp[]
      }>({
        url: clientApi(`snapshots/timestamps`),
        method: 'POST',
        data: {
          doorbot_ids: [this.id]
        },
        json: true
      }),
      deviceTimestamp = timestamps[0],
      timestamp = deviceTimestamp ? deviceTimestamp.timestamp : 0

    return Math.abs(responseTimestamp - timestamp)
  }

  private refreshSnapshotInProgress?: Promise<void>
  private snapshotLifeTime = (this.hasBattery ? 600 : 30) * 1000 // battery cams only refresh timestamp every 10 minutes

  private async refreshSnapshot(allowStale: boolean) {
    const initialTimestampAge = await this.getTimestampAge(),
      snapshotInLifeTime = initialTimestampAge < this.snapshotLifeTime

    if (allowStale && (this.hasBattery || snapshotInLifeTime)) {
      // battery cameras take a long time to refresh snapshots.  Just return the stale one immediately.
      // for non battery, stale snapshots can be used if they are within the last 30 seconds
      return
    }

    if (snapshotInLifeTime) {
      // not allowing stale, so wait until a new snapshot should be available
      await delay(this.snapshotLifeTime - initialTimestampAge)
    }

    for (let i = 0; i < maxSnapshotRefreshAttempts; i++) {
      const timestampAge = await this.getTimestampAge()

      if (timestampAge < initialTimestampAge) {
        return
      }

      await delay(snapshotRefreshDelay)
    }

    throw new Error(
      `Snapshot failed to refresh after ${maxSnapshotRefreshAttempts} attempts`
    )
  }

  async getSnapshot(allowStale = false) {
    this.refreshSnapshotInProgress =
      this.refreshSnapshotInProgress || this.refreshSnapshot(allowStale)

    try {
      await this.refreshSnapshotInProgress
    } catch (e) {
      if (!allowStale) {
        logError(e)
        throw e
      }
    }

    this.refreshSnapshotInProgress = undefined

    return this.restClient.request<Buffer>({
      url: clientApi(`snapshots/image/${this.id}`),
      responseType: 'arraybuffer'
    })
  }

  sipUsedDingIds: string[] = []

  async getSipOptions() {
    const activeDings = this.onActiveDings.getValue(),
      existingDing = activeDings
        .slice()
        .reverse()
        .find(x => !this.sipUsedDingIds.includes(x.id_str)),
      targetDing = existingDing || (await this.getSipConnectionDetails())

    this.sipUsedDingIds.push(targetDing.id_str)

    return {
      to: targetDing.sip_to,
      from: targetDing.sip_from,
      dingId: targetDing.id_str
    }
  }

  async createSipSession(
    srtpOption: { audio?: SrtpOptions; video?: SrtpOptions } = {}
  ) {
    const videoSocket = createSocket('udp4'),
      audioSocket = createSocket('udp4'),
      [sipOptions, publicIpPromise, videoPort, audioPort] = await Promise.all([
        this.getSipOptions(),
        getPublicIp(),
        bindToRandomPort(videoSocket),
        bindToRandomPort(audioSocket)
      ]),
      rtpOptions = {
        address: await publicIpPromise,
        audio: {
          port: audioPort,
          ...srtpOption.audio
        },
        video: {
          port: videoPort,
          ...srtpOption.video
        }
      }

    return new SipSession(
      {
        ...sipOptions,
        tlsPort: await getPort() // get a random port, this can still cause race conditions.
      },
      rtpOptions,
      videoSocket,
      audioSocket
    )
  }
}
