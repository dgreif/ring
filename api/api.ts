import {
  clientApi,
  deviceApi,
  RefreshTokenAuth,
  RingRestClient,
  SessionOptions,
} from './rest-client'
import { Location } from './location'
import {
  ActiveDing,
  BaseStation,
  BeamBridge,
  CameraData,
  ChimeData,
  ProfileResponse,
  UserLocation,
} from './ring-types'
import { RingCamera } from './ring-camera'
import { RingChime } from './ring-chime'
import { EMPTY, merge, Subject } from 'rxjs'
import { debounceTime, switchMap, throttleTime } from 'rxjs/operators'
import { enableDebug, logError } from './util'
import { setFfmpegPath } from './ffmpeg'
import { Subscribed } from './subscribed'

export interface RingApiOptions extends SessionOptions {
  locationIds?: string[]
  cameraStatusPollingSeconds?: number
  cameraDingsPollingSeconds?: number
  locationModePollingSeconds?: number
  avoidSnapshotBatteryDrain?: boolean
  treatKnockAsDing?: boolean
  debug?: boolean
  ffmpegPath?: string
  externalPorts?: {
    start: number
    end: number
  }
}

export class RingApi extends Subscribed {
  public readonly restClient
  public readonly onRefreshTokenUpdated

  constructor(public readonly options: RingApiOptions & RefreshTokenAuth) {
    super()

    this.restClient = new RingRestClient(this.options)
    this.onRefreshTokenUpdated =
      this.restClient.onRefreshTokenUpdated.asObservable()

    if (options.debug) {
      enableDebug()
    }

    const { locationIds, ffmpegPath } = options

    if (locationIds && !locationIds.length) {
      logError(
        'Your Ring config has `"locationIds": []`, which means no locations will be used and no devices will be found.'
      )
    }

    if (ffmpegPath) {
      setFfmpegPath(ffmpegPath)
    }
  }

  async fetchRingDevices() {
    const {
      doorbots,
      chimes,
      authorized_doorbots: authorizedDoorbots,
      stickup_cams: stickupCams,
      base_stations: baseStations,
      beams_bridges: beamBridges,
    } = await this.restClient.request<{
      doorbots: CameraData[]
      chimes: ChimeData[]
      authorized_doorbots: CameraData[]
      stickup_cams: CameraData[]
      base_stations: BaseStation[]
      beams_bridges: BeamBridge[]
    }>({ url: clientApi('ring_devices') })

    return {
      doorbots,
      chimes,
      authorizedDoorbots,
      stickupCams,
      allCameras: doorbots.concat(stickupCams, authorizedDoorbots),
      baseStations,
      beamBridges,
    }
  }

  fetchActiveDings() {
    return this.restClient.request<ActiveDing[]>({
      url: clientApi('dings/active'),
    })
  }

  private listenForDeviceUpdates(cameras: RingCamera[], chimes: RingChime[]) {
    const { cameraStatusPollingSeconds, cameraDingsPollingSeconds } =
        this.options,
      onCamerasRequestUpdate = merge(
        ...cameras.map((camera) => camera.onRequestUpdate)
      ),
      onChimesRequestUpdate = merge(
        ...chimes.map((chime) => chime.onRequestUpdate)
      ),
      onCamerasRequestActiveDings = merge(
        ...cameras.map((camera) => camera.onRequestActiveDings)
      ),
      onUpdateReceived = new Subject(),
      onActiveDingsReceived = new Subject(),
      onPollForStatusUpdate = cameraStatusPollingSeconds
        ? onUpdateReceived.pipe(debounceTime(cameraStatusPollingSeconds * 1000))
        : EMPTY,
      onPollForActiveDings = cameraDingsPollingSeconds
        ? onActiveDingsReceived.pipe(
            debounceTime(cameraDingsPollingSeconds * 1000)
          )
        : EMPTY,
      camerasById = cameras.reduce((byId, camera) => {
        byId[camera.id] = camera
        return byId
      }, {} as { [id: number]: RingCamera }),
      chimesById = chimes.reduce((byId, chime) => {
        byId[chime.id] = chime
        return byId
      }, {} as { [id: number]: RingChime })

    if (!cameras.length && !chimes.length) {
      return
    }

    this.addSubscriptions(
      merge(
        onCamerasRequestUpdate,
        onChimesRequestUpdate,
        onPollForStatusUpdate
      )
        .pipe(
          throttleTime(500),
          switchMap(() => this.fetchRingDevices().catch(() => null))
        )
        .subscribe((response) => {
          onUpdateReceived.next(null)

          if (!response) {
            return
          }

          response.allCameras.forEach((data) => {
            const camera = camerasById[data.id]
            if (camera) {
              camera.updateData(data)
            }
          })

          response.chimes.forEach((data) => {
            const chime = chimesById[data.id]
            if (chime) {
              chime.updateData(data)
            }
          })
        })
    )

    if (cameraStatusPollingSeconds) {
      onUpdateReceived.next(null) // kick off polling
    }

    this.addSubscriptions(
      merge(onCamerasRequestActiveDings, onPollForActiveDings).subscribe(
        async () => {
          const activeDings = await this.fetchActiveDings().catch(() => null)
          onActiveDingsReceived.next(null)

          if (!activeDings || !activeDings.length) {
            return
          }

          activeDings.forEach((activeDing) => {
            const camera = camerasById[activeDing.doorbot_id]
            if (camera) {
              camera.processActiveDing(activeDing)
            }
          })
        }
      )
    )

    if (cameras.length && cameraDingsPollingSeconds) {
      onActiveDingsReceived.next(null) // kick off polling
    }
  }

  async fetchRawLocations() {
    const { user_locations: rawLocations } = await this.restClient.request<{
      user_locations: UserLocation[]
    }>({ url: deviceApi('locations') })

    if (!rawLocations) {
      throw new Error(
        'The Ring account which you used to generate a refresh token does not have any associated locations.  Please use an account that has access to at least one location.'
      )
    }

    return rawLocations
  }

  fetchAmazonKeyLocks() {
    return this.restClient.request<any[]>({
      url: 'https://api.ring.com/integrations/amazonkey/v2/devices/lock_associations',
    })
  }

  async fetchAndBuildLocations() {
    const rawLocations = await this.fetchRawLocations(),
      {
        authorizedDoorbots,
        chimes,
        doorbots,
        allCameras,
        baseStations,
        beamBridges,
      } = await this.fetchRingDevices(),
      locationIdsWithHubs = [...baseStations, ...beamBridges].map(
        (x) => x.location_id
      ),
      cameras = allCameras.map(
        (data) =>
          new RingCamera(
            data,
            doorbots.includes(data) ||
              authorizedDoorbots.includes(data) ||
              data.kind.startsWith('doorbell'),
            this.restClient,
            this.options.avoidSnapshotBatteryDrain || false,
            this.options.treatKnockAsDing || false
          )
      ),
      ringChimes = chimes.map((data) => new RingChime(data, this.restClient)),
      locations = rawLocations
        .filter((location) => {
          return (
            !Array.isArray(this.options.locationIds) ||
            this.options.locationIds.includes(location.location_id)
          )
        })
        .map(
          (location) =>
            new Location(
              location,
              cameras.filter(
                (x) => x.data.location_id === location.location_id
              ),
              ringChimes.filter(
                (x) => x.data.location_id === location.location_id
              ),
              {
                hasHubs: locationIdsWithHubs.includes(location.location_id),
                hasAlarmBaseStation: baseStations.some(
                  (station) => station.location_id === location.location_id
                ),
                locationModePollingSeconds:
                  this.options.locationModePollingSeconds,
              },
              this.restClient
            )
        )

    this.listenForDeviceUpdates(cameras, ringChimes)

    return locations
  }

  private locationsPromise: Promise<Location[]> | undefined
  getLocations() {
    if (!this.locationsPromise) {
      this.locationsPromise = this.fetchAndBuildLocations()
    }

    return this.locationsPromise
  }

  async getCameras() {
    const locations = await this.getLocations()
    return locations.reduce(
      (cameras, location) => [...cameras, ...location.cameras],
      [] as RingCamera[]
    )
  }

  getProfile() {
    return this.restClient.request<ProfileResponse>({
      url: clientApi('profile'),
    })
  }

  disconnect() {
    this.unsubscribe()
    if (!this.locationsPromise) {
      return
    }

    this.getLocations()
      .then((locations) =>
        locations.forEach((location) => location.disconnect())
      )
      .catch((e) => {
        logError(e)
      })

    this.restClient.clearTimeouts()
  }
}
