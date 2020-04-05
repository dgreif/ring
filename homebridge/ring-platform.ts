import {
  RingApi,
  RingCamera,
  RingCameraKind,
  RingDevice,
  RingDeviceCategory,
  RingDeviceType,
} from '../api'
import { HAP, hap } from './hap'
import { SecurityPanel } from './security-panel'
import { BaseStation } from './base-station'
import { Keypad } from './keypad'
import { ContactSensor } from './contact-sensor'
import { MotionSensor } from './motion-sensor'
import { Lock } from './lock'
import { SmokeAlarm } from './smoke-alarm'
import { CoAlarm } from './co-alarm'
import { SmokeCoListener } from './smoke-co-listener'
import { RingPlatformConfig, updateHomebridgeConfig } from './config'
import { Beam } from './beam'
import { MultiLevelSwitch } from './multi-level-switch'
import { Fan } from './fan'
import { Switch } from './switch'
import { Camera } from './camera'
import { PanicButtons } from './panic-buttons'
import { RefreshTokenAuth } from '../api/rest-client'
import { useLogger } from '../api/util'
import { BaseAccessory } from './base-accessory'
import { FloodFreezeSensor } from './flood-freeze-sensor'
import { FreezeSensor } from './freeze-sensor'
import { TemperatureSensor } from './temperature-sensor'
import { LocationModeSwitch } from './location-mode-switch'

const debug = __filename.includes('release-homebridge'),
  unsupportedDeviceTypes: (RingDeviceType | RingCameraKind)[] = [
    RingDeviceType.BaseStation,
    RingDeviceType.Keypad,
  ]

export const platformName = 'Ring'
export const pluginName = 'homebridge-ring'
process.env.RING_DEBUG = debug ? 'true' : ''

function getAccessoryClass(
  device: RingDevice
): (new (...args: any[]) => BaseAccessory<RingDevice>) | null {
  const { deviceType } = device

  if (device.data.status === 'disabled') {
    return null
  }

  switch (deviceType) {
    case RingDeviceType.ContactSensor:
    case RingDeviceType.RetrofitZone:
      return ContactSensor
    case RingDeviceType.MotionSensor:
      return MotionSensor
    case RingDeviceType.FloodFreezeSensor:
      return FloodFreezeSensor
    case RingDeviceType.FreezeSensor:
      return FreezeSensor
    case RingDeviceType.SecurityPanel:
      return SecurityPanel
    case RingDeviceType.BaseStation:
      return BaseStation
    case RingDeviceType.Keypad:
      return Keypad
    case RingDeviceType.SmokeAlarm:
      return SmokeAlarm
    case RingDeviceType.CoAlarm:
      return CoAlarm
    case RingDeviceType.SmokeCoListener:
      return SmokeCoListener
    case RingDeviceType.BeamsMotionSensor:
    case RingDeviceType.BeamsSwitch:
    case RingDeviceType.BeamsTransformerSwitch:
    case RingDeviceType.BeamsLightGroupSwitch:
      return Beam
    case RingDeviceType.MultiLevelSwitch:
      return device instanceof RingDevice &&
        device.categoryId === RingDeviceCategory.Fans
        ? Fan
        : MultiLevelSwitch
    case RingDeviceType.MultiLevelBulb:
      return MultiLevelSwitch
    case RingDeviceType.Switch:
      return Switch
    case RingDeviceType.TemperatureSensor:
      return TemperatureSensor
  }

  if (/^lock($|\.)/.test(deviceType)) {
    return Lock
  }

  return null
}

export class RingPlatform {
  private readonly homebridgeAccessories: { [uuid: string]: HAP.Accessory } = {}

  constructor(
    public log: HAP.Log,
    public config: RingPlatformConfig & RefreshTokenAuth,
    public api: HAP.Platform
  ) {
    useLogger({
      logInfo(message) {
        log.info(message)
      },
      logError(message) {
        log.error(message)
      },
    })

    if (!config) {
      this.log.info('No configuration found for platform Ring')
      return
    }

    config.cameraStatusPollingSeconds = config.cameraStatusPollingSeconds ?? 20
    config.cameraDingsPollingSeconds = config.cameraDingsPollingSeconds ?? 2
    config.locationModePollingSeconds = config.locationModePollingSeconds ?? 20

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching')
      this.connectToApi().catch((e) => {
        this.log.error('Error connecting to API')
        this.log.error(e)
      })
    })

    this.homebridgeAccessories = {}
  }

  configureAccessory(accessory: HAP.Accessory) {
    this.log.info(
      `Configuring cached accessory ${accessory.UUID} ${accessory.displayName}`
    )
    this.log.debug('%j', accessory)
    this.homebridgeAccessories[accessory.UUID] = accessory
  }

  async connectToApi() {
    const ringApi = new RingApi({
        controlCenterDisplayName: 'homebridge-ring',
        ffmpegPath: require('ffmpeg-for-homebridge'),
        ...this.config,
      }),
      locations = await ringApi.getLocations(),
      { api } = this,
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      platformAccessories: HAP.Accessory[] = [],
      cameraAccessories: HAP.Accessory[] = [],
      activeAccessoryIds: string[] = []

    await Promise.all(
      locations.map(async (location) => {
        const devices = await location.getDevices(),
          cameras = location.cameras,
          allDevices = [...devices, ...cameras],
          securityPanel = devices.find(
            (x) => x.deviceType === RingDeviceType.SecurityPanel
          ),
          debugPrefix = debug ? 'TEST ' : '',
          hapDevices = allDevices.map((device) => {
            const isCamera = device instanceof RingCamera,
              cameraIdDifferentiator = isCamera ? 'camera' : '' // this forces bridged cameras from old version of the plugin to be seen as "stale"

            return {
              deviceType: device.deviceType as string,
              device: device as any,
              isCamera,
              id: device.id.toString() + cameraIdDifferentiator,
              name: device.name,
              AccessoryClass: (device instanceof RingCamera
                ? Camera
                : getAccessoryClass(device)) as
                | (new (...args: any[]) => BaseAccessory<any>)
                | null,
            }
          })

        if (this.config.showPanicButtons && securityPanel) {
          hapDevices.push({
            deviceType: securityPanel.deviceType,
            device: securityPanel,
            isCamera: false,
            id: securityPanel.id.toString() + 'panic',
            name: 'Panic Buttons',
            AccessoryClass: PanicButtons,
          })
        }

        if (
          this.config.locationModePollingSeconds &&
          (await location.supportsLocationModeSwitching())
        ) {
          hapDevices.push({
            deviceType: 'location.mode',
            device: location,
            isCamera: false,
            id: location.id + 'mode',
            name: location.name + ' Mode',
            AccessoryClass: LocationModeSwitch,
          })
        }

        this.log.info(
          `Configuring ${cameras.length} cameras and ${hapDevices.length} devices for location "${location.name}" - locationId: ${location.id}`
        )
        hapDevices.forEach(
          ({ deviceType, device, isCamera, id, name, AccessoryClass }) => {
            const uuid = hap.UUIDGen.generate(debugPrefix + id),
              displayName = debugPrefix + name

            if (
              !AccessoryClass ||
              (this.config.hideLightGroups &&
                deviceType === RingDeviceType.BeamsLightGroupSwitch) ||
              (this.config.hideUnsupportedServices &&
                unsupportedDeviceTypes.includes(deviceType as any))
            ) {
              this.log.info(`Hidden accessory ${deviceType} ${displayName}`)
              return
            }

            const createHomebridgeAccessory = () => {
                const accessory = new hap.PlatformAccessory(
                  displayName,
                  uuid,
                  isCamera
                    ? hap.AccessoryCategories.CAMERA
                    : hap.AccessoryCategories.SECURITY_SYSTEM
                )

                this.log.info(
                  `Adding new accessory ${deviceType} ${displayName}`
                )

                if (isCamera) {
                  cameraAccessories.push(accessory)
                } else {
                  platformAccessories.push(accessory)
                }

                return accessory
              },
              homebridgeAccessory =
                this.homebridgeAccessories[uuid] || createHomebridgeAccessory(),
              accessory = new AccessoryClass(
                device as any,
                homebridgeAccessory,
                this.log,
                this.config
              )
            accessory.initBase()

            this.homebridgeAccessories[uuid] = homebridgeAccessory
            activeAccessoryIds.push(uuid)
          }
        )
      })
    )

    if (platformAccessories.length) {
      api.registerPlatformAccessories(
        pluginName,
        platformName,
        platformAccessories
      )
    }
    if (cameraAccessories.length) {
      api.publishCameraAccessories(pluginName, cameraAccessories)
    }

    const staleAccessories = cachedAccessoryIds
      .filter((cachedId) => !activeAccessoryIds.includes(cachedId))
      .map((id) => this.homebridgeAccessories[id])

    staleAccessories.forEach((staleAccessory) => {
      this.log.info(
        `Removing stale cached accessory ${staleAccessory.UUID} ${staleAccessory.displayName}`
      )
    })

    if (staleAccessories.length) {
      this.api.unregisterPlatformAccessories(
        pluginName,
        platformName,
        staleAccessories
      )
    }

    ringApi.onRefreshTokenUpdated.subscribe(
      ({ oldRefreshToken, newRefreshToken }) => {
        if (!oldRefreshToken) {
          return
        }

        updateHomebridgeConfig(this.api, (config) => {
          return config.replace(oldRefreshToken, newRefreshToken)
        })
      }
    )
  }
}
