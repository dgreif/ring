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
  DingKind,
  ProfileResponse,
  PushNotificationData,
  UserLocation,
} from './ring-types'
import { RingCamera } from './ring-camera'
import { RingChime } from './ring-chime'
import { EMPTY, merge, Subject } from 'rxjs'
import { debounceTime, switchMap, throttleTime } from 'rxjs/operators'
import { enableDebug, logError } from './util'
import { setFfmpegPath } from './ffmpeg'
import { Subscribed } from './subscribed'
import PushReceiver from '@eneris/push-receiver'

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
    const { cameraStatusPollingSeconds } = this.options
    if (!cameraStatusPollingSeconds) {
      return
    }
    const onCamerasRequestUpdate = merge(
        ...cameras.map((camera) => camera.onRequestUpdate)
      ),
      onChimesRequestUpdate = merge(
        ...chimes.map((chime) => chime.onRequestUpdate)
      ),
      onUpdateReceived = new Subject(),
      onPollForStatusUpdate = cameraStatusPollingSeconds
        ? onUpdateReceived.pipe(debounceTime(cameraStatusPollingSeconds * 1000))
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
  }

  async registerPushReceiver(cameras: RingCamera[]) {
    const pushReceiver = new PushReceiver({
        logLevel: 'NONE',
        senderId: '876313859327', // for Ring android app.  703521446232 for ring-site
      }),
      camerasById = cameras.reduce((byId, camera) => {
        byId[camera.id] = camera
        return byId
      }, {} as { [id: number]: RingCamera })

    pushReceiver.onCredentialsChanged(
      async ({
        newCredentials: {
          fcm: { token },
        },
      }) => {
        try {
          await this.restClient.request({
            url: clientApi('device'),
            method: 'PATCH',
            json: {
              device: {
                metadata: {
                  pn_service: 'fcm',
                },
                os: 'android',
                push_notification_token: token,
              },
            },
          })
        } catch (e) {
          logError(e)
        }
      }
    )

    pushReceiver.onNotification((notification) => {
      const dataJson = notification.message.data?.gcmData as string

      try {
        const { ding, subtype } = JSON.parse(dataJson) as PushNotificationData,
          camera = camerasById[ding.doorbot_id]

        if (camera) {
          camera.processActiveDing({
            id: ding.id,
            id_str: ding.id.toString(),
            state: 'ringing',
            protocol: 'sip', //ding.streaming_protocol,
            doorbot_id: ding.doorbot_id,
            doorbot_description: ding.device_name,
            device_kind: ding.device_kind,
            motion: subtype === 'motion',
            snapshot_url: ding.image_uuid,
            kind: subtype as DingKind,
            sip_server_ip: '',
            sip_server_port: 0,
            sip_server_tls: true,
            sip_session_id: '',
            sip_from: '',
            sip_to: '',
            audio_jitter_buffer_ms: 0,
            video_jitter_buffer_ms: 0,
            sip_endpoints: null,
            expires_in: 0,
            now: 0,
            optimization_level: 0,
            sip_token: '',
            sip_ding_id: '',
          })
        }
      } catch (e) {
        logError(e)
      }
    })

    try {
      await pushReceiver.connect()
    } catch (e) {
      logError('Failed to connect push notification receiver')
      logError(e)
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
    this.registerPushReceiver(cameras).catch((e) => {
      logError(e)
    })

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
