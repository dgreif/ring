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
  PushNotificationAction,
  RingDeviceType,
  ThirdPartyGarageDoorOpener,
  UnknownDevice,
  UserLocation,
} from './ring-types'
import { AnyCameraData, RingCamera } from './ring-camera'
import { RingChime } from './ring-chime'
import { combineLatest, EMPTY, merge, Subject } from 'rxjs'
import {
  debounceTime,
  startWith,
  switchMap,
  throttleTime,
} from 'rxjs/operators'
import { clearTimeouts, enableDebug, logError, logInfo } from './util'
import { setFfmpegPath } from './ffmpeg'
import { Subscribed } from './subscribed'
import PushReceiver from '@eneris/push-receiver'
import { RingIntercom } from './ring-intercom'
import JSONbig from 'json-bigint'

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
        'Your Ring config has `"locationIds": []`, which means no locations will be used and no devices will be found.',
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
    intercoms: RingIntercom[],
  ) {
    const { cameraStatusPollingSeconds } = this.options
    if (!cameraStatusPollingSeconds) {
      return
    }
    const devices = [...cameras, ...chimes, ...intercoms],
      onDeviceRequestUpdate = merge(
        ...devices.map((device) => device.onRequestUpdate),
      ),
      onUpdateReceived = new Subject(),
      onPollForStatusUpdate = cameraStatusPollingSeconds
        ? onUpdateReceived.pipe(debounceTime(cameraStatusPollingSeconds * 1000))
        : EMPTY,
      camerasById = cameras.reduce(
        (byId, camera) => {
          byId[camera.id] = camera
          return byId
        },
        {} as { [id: number]: RingCamera },
      ),
      chimesById = chimes.reduce(
        (byId, chime) => {
          byId[chime.id] = chime
          return byId
        },
        {} as { [id: number]: RingChime },
      ),
      intercomsById = intercoms.reduce(
        (byId, intercom) => {
          byId[intercom.id] = intercom
          return byId
        },
        {} as { [id: number]: RingIntercom },
      )

    if (!cameras.length && !chimes.length && !intercoms.length) {
      return
    }

    this.addSubscriptions(
      merge(onDeviceRequestUpdate, onPollForStatusUpdate)
        .pipe(
          throttleTime(500),
          switchMap(() => this.fetchRingDevices().catch(() => null)),
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
        }),
    )

    if (cameraStatusPollingSeconds) {
      onUpdateReceived.next(null) // kick off polling
    }
  }

  private async registerPushReceiver(
    cameras: RingCamera[],
    intercoms: RingIntercom[],
  ) {
    const credentials =
        this.restClient._internalOnly_pushNotificationCredentials,
      pushReceiver = new PushReceiver({
        firebase: {
          apiKey: 'AIzaSyCv-hdFBmmdBBJadNy-TFwB-xN_H5m3Bk8',
          projectId: 'ring-17770',
          messagingSenderId: '876313859327', // for Ring android app.  703521446232 for ring-site
          appId: '1:876313859327:android:e10ec6ddb3c81f39',
        },
        credentials: credentials?.config ? credentials : undefined,
        debug: false,
      }),
      devicesById: { [id: number]: RingCamera | RingIntercom | undefined } = {},
      sendToDevice = (id: number, notification: PushNotification) => {
        devicesById[id]?.processPushNotification(notification)
      },
      onPushNotificationToken = new Subject<string>()

    for (const camera of cameras) {
      devicesById[camera.id] = camera
    }
    for (const intercom of intercoms) {
      devicesById[intercom.id] = intercom
    }

    pushReceiver.onCredentialsChanged(({ newCredentials }) => {
      // Store the new credentials in the rest client so that it can be used for subsequent restarts
      this.restClient._internalOnly_pushNotificationCredentials = newCredentials

      // Send the new credentials to the server
      onPushNotificationToken.next(newCredentials.fcm.token)
    })

    this.addSubscriptions(
      combineLatest([
        onPushNotificationToken,
        this.restClient.onSession.pipe(startWith(undefined)), // combined but not used here, just to trigger another request when session is updated
      ]).subscribe(async ([token]) => {
        try {
          await this.restClient.request({
            url: clientApi('device'),
            method: 'PATCH',
            json: {
              device: {
                metadata: {
                  ...this.restClient.baseSessionMetadata,
                  pn_dict_version: '2.0.0',
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
      }),
    )

    try {
      await pushReceiver.connect()
    } catch (e) {
      logError('Failed to connect push notification receiver')
      logError(e)
    }

    const startTime = Date.now()
    pushReceiver.onNotification(({ message }) => {
      // Ignore messages received in the first two seconds after connecting
      // These are likely duplicates, and we aren't currently storying persistent ids anywhere to avoid re-processing them
      if (Date.now() - startTime < 2000) {
        logInfo(
          'Ignoring push notification received in first two seconds after starting up',
        )
        return
      }

      try {
        const messageData = {} as any
        // Each message field is a JSON string, so we need to parse them each individually
        for (const p in message.data) {
          try {
            // If it's a JSON string, parse it into an object
            messageData[p] = JSONbig({ storeAsString: true }).parse(
              message.data[p] as string,
            )
          } catch {
            // Otherwise just assign the value directly
            messageData[p] = message.data[p]
          }
        }

        const notification = messageData as PushNotification,
          deviceId = notification.data?.device?.id

        if (deviceId) {
          sendToDevice(deviceId, notification)
        }

        const eventCategory = notification.android_config.category

        if (
          eventCategory !== PushNotificationAction.Ding &&
          eventCategory !== PushNotificationAction.Motion
        ) {
          logInfo(
            'Received push notification with unknown category: ' +
              eventCategory,
          )
          logInfo(JSON.stringify(message))
        }
      } catch (e) {
        logError(e)
      }
    })

    // If we already have credentials, use them immediately
    if (credentials) {
      onPushNotificationToken.next(credentials.fcm.token)
    }
  }

  async fetchRawLocations() {
    const { user_locations: rawLocations } = await this.restClient.request<{
      user_locations: UserLocation[]
    }>({ url: deviceApi('locations') })

    if (!rawLocations) {
      throw new Error(
        'The Ring account which you used to generate a refresh token does not have any associated locations.  Please use an account that has access to at least one location.',
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
        (x) => x.location_id,
      ),
      cameras = allCameras.map(
        (data) =>
          new RingCamera(
            data,
            doorbots.includes(data as CameraData) ||
              authorizedDoorbots.includes(data as CameraData) ||
              data.kind.startsWith('doorbell'),
            this.restClient,
            this.options.avoidSnapshotBatteryDrain || false,
          ),
      ),
      ringChimes = chimes.map((data) => new RingChime(data, this.restClient)),
      ringIntercoms = intercoms.map(
        (data) => new RingIntercom(data, this.restClient),
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
                (x) => x.data.location_id === location.location_id,
              ),
              ringChimes.filter(
                (x) => x.data.location_id === location.location_id,
              ),
              ringIntercoms.filter(
                (x) => x.data.location_id === location.location_id,
              ),
              {
                hasHubs: locationIdsWithHubs.includes(location.location_id),
                hasAlarmBaseStation: baseStations.some(
                  (station) => station.location_id === location.location_id,
                ),
                locationModePollingSeconds:
                  this.options.locationModePollingSeconds,
              },
              this.restClient,
            ),
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
      [] as RingCamera[],
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
        locations.forEach((location) => location.disconnect()),
      )
      .catch((e) => {
        logError(e)
      })

    this.restClient.clearTimeouts()
    clearTimeouts()
  }
}
