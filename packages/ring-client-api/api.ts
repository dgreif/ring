import {
  clientApi,
  deviceApi,
  RefreshTokenAuth,
  RingRestClient,
  SessionOptions,
} from './rest-client'
import { Location } from './location'
import {
  BaseStation,
  BeamBridge,
  CameraData,
  ChimeData,
  IntercomHandsetAudioData,
  OnvifCameraData,
  ProfileResponse,
  PushNotification,
  RingDeviceType,
  ThirdPartyGarageDoorOpener,
  UnknownDevice,
  UserLocation,
} from './ring-types'
import { AnyCameraData, RingCamera } from './ring-camera'
import { RingChime } from './ring-chime'
import { EMPTY, merge, Subject } from 'rxjs'
import { debounceTime, switchMap, throttleTime } from 'rxjs/operators'
import { enableDebug, logError } from './util'
import { setFfmpegPath } from './ffmpeg'
import { Subscribed } from './subscribed'
import PushReceiver from '@eneris/push-receiver'
import { RingIntercom } from './ring-intercom'

export interface RingApiOptions extends SessionOptions {
  locationIds?: string[]
  cameraStatusPollingSeconds?: number
  locationModePollingSeconds?: number
  avoidSnapshotBatteryDrain?: boolean
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
        other: otherDevices,
      } = await this.restClient.request<{
        doorbots: CameraData[]
        chimes: ChimeData[]
        authorized_doorbots: CameraData[]
        stickup_cams: CameraData[]
        base_stations: BaseStation[]
        beams_bridges: BeamBridge[]
        other: (
          | IntercomHandsetAudioData
          | OnvifCameraData
          | ThirdPartyGarageDoorOpener
          | UnknownDevice
        )[]
      }>({ url: clientApi('ring_devices') }),
      onvifCameras = [] as OnvifCameraData[],
      intercoms = [] as IntercomHandsetAudioData[],
      thirdPartyGarageDoorOpeners = [] as ThirdPartyGarageDoorOpener[],
      unknownDevices = [] as UnknownDevice[]

    otherDevices.forEach((device) => {
      switch (device.kind) {
        case RingDeviceType.OnvifCamera:
          onvifCameras.push(device as OnvifCameraData)
          break
        case RingDeviceType.IntercomHandsetAudio:
          intercoms.push(device as IntercomHandsetAudioData)
          break
        case RingDeviceType.ThirdPartyGarageDoorOpener:
          thirdPartyGarageDoorOpeners.push(device as ThirdPartyGarageDoorOpener)
          break
        default:
          unknownDevices.push(device)
          break
      }
    })

    return {
      doorbots,
      chimes,
      authorizedDoorbots,
      stickupCams,
      allCameras: [
        ...doorbots,
        ...stickupCams,
        ...authorizedDoorbots,
        ...onvifCameras,
      ] as AnyCameraData[],
      baseStations,
      beamBridges,
      onvifCameras,
      thirdPartyGarageDoorOpeners,
      intercoms,
      unknownDevices,
    }
  }

  private listenForDeviceUpdates(
    cameras: RingCamera[],
    chimes: RingChime[],
    intercoms: RingIntercom[]
  ) {
    const { cameraStatusPollingSeconds } = this.options
    if (!cameraStatusPollingSeconds) {
      return
    }
    const devices = [...cameras, ...chimes, ...intercoms],
      onDeviceRequestUpdate = merge(
        ...devices.map((device) => device.onRequestUpdate)
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
      }, {} as { [id: number]: RingChime }),
      intercomsById = intercoms.reduce((byId, intercom) => {
        byId[intercom.id] = intercom
        return byId
      }, {} as { [id: number]: RingIntercom })

    if (!cameras.length && !chimes.length && !intercoms.length) {
      return
    }

    this.addSubscriptions(
      merge(onDeviceRequestUpdate, onPollForStatusUpdate)
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

          response.intercoms.forEach((data) => {
            const intercom = intercomsById[data.id]
            if (intercom) {
              intercom.updateData(data)
            }
          })
        })
    )

    if (cameraStatusPollingSeconds) {
      onUpdateReceived.next(null) // kick off polling
    }
  }

  private async registerPushReceiver(
    cameras: RingCamera[],
    intercoms: RingIntercom[]
  ) {
    const pushReceiver = new PushReceiver({
        logLevel: 'NONE',
        senderId: '876313859327', // for Ring android app.  703521446232 for ring-site
      }),
      devicesById: { [id: number]: RingCamera | RingIntercom | undefined } = {},
      sendToDevice = (id: number, notification: PushNotification) => {
        devicesById[id]?.processPushNotification(notification)
      }

    for (const camera of cameras) {
      devicesById[camera.id] = camera
    }
    for (const intercom of intercoms) {
      devicesById[intercom.id] = intercom
    }

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
                  ...this.restClient.baseSessionMetadata,
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

    pushReceiver.onNotification(({ message }) => {
      const dataJson = message.data?.gcmData as string

      try {
        const notification = JSON.parse(dataJson) as PushNotification

        if ('ding' in notification) {
          sendToDevice(notification.ding.doorbot_id, notification)
        } else if ('alarm_meta' in notification) {
          // Alarm notification, such as intercom unlocked
          sendToDevice(notification.alarm_meta.device_zid, notification)
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
        intercoms,
      } = await this.fetchRingDevices(),
      locationIdsWithHubs = [...baseStations, ...beamBridges].map(
        (x) => x.location_id
      ),
      cameras = allCameras.map(
        (data) =>
          new RingCamera(
            data,
            doorbots.includes(data as CameraData) ||
              authorizedDoorbots.includes(data as CameraData) ||
              data.kind.startsWith('doorbell'),
            this.restClient,
            this.options.avoidSnapshotBatteryDrain || false
          )
      ),
      ringChimes = chimes.map((data) => new RingChime(data, this.restClient)),
      ringIntercoms = intercoms.map(
        (data) => new RingIntercom(data, this.restClient)
      ),
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
              ringIntercoms.filter(
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

    this.listenForDeviceUpdates(cameras, ringChimes, ringIntercoms)
    this.registerPushReceiver(cameras, ringIntercoms).catch((e) => {
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
