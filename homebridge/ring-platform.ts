import {
  RingApi,
  RingCamera,
  RingCameraKind,
  RingChime,
  RingDevice,
  RingDeviceCategory,
  RingDeviceType,
} from '../api'
import { hap } from './hap'
import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge'
import { SecurityPanel } from './security-panel'
import { BaseStation } from './base-station'
import { Chime } from './chime'
import { Keypad } from './keypad'
import { ContactSensor } from './contact-sensor'
import { MotionSensor } from './motion-sensor'
import { Lock } from './lock'
import { SmokeAlarm } from './smoke-alarm'
import { CoAlarm } from './co-alarm'
import { SmokeCoListener } from './smoke-co-listener'
import {
  getSystemId,
  RingPlatformConfig,
  updateHomebridgeConfig,
} from './config'
import { Beam } from './beam'
import { MultiLevelSwitch } from './multi-level-switch'
import { Fan } from './fan'
import { Outlet } from './outlet'
import { Switch } from './switch'
import { Camera } from './camera'
import { PanicButtons } from './panic-buttons'
import { RefreshTokenAuth } from '../api/rest-client'
import { useLogger } from '../api/util'
import { BaseAccessory } from './base-accessory'
import { FloodFreezeSensor } from './flood-freeze-sensor'
import { FreezeSensor } from './freeze-sensor'
import { TemperatureSensor } from './temperature-sensor'
import { WaterSensor } from './water-sensor'
import { LocationModeSwitch } from './location-mode-switch'
import { Thermostat } from './thermostat'
import { UnknownZWaveSwitchSwitch } from './unknown-zwave-switch'
import { generateMacAddress } from './util'

const debug = __filename.includes('release-homebridge'),
  unsupportedDeviceTypes: (
    | RingDeviceType
    | RingCameraKind
    | RingChime['deviceType']
  )[] = [RingDeviceType.BaseStation, RingDeviceType.Keypad],
  ignoreHiddenDeviceTypes: string[] = [
    RingDeviceType.RingNetAdapter,
    RingDeviceType.ZigbeeAdapter,
    RingDeviceType.CodeVault,
    RingDeviceType.SecurityAccessCode,
    RingDeviceType.ZWaveAdapter,
    RingDeviceType.ZWaveExtender,
    RingDeviceType.BeamsDevice,
    RingDeviceType.PanicButton,
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
    case RingDeviceType.TiltSensor:
    case RingDeviceType.GlassbreakSensor:
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
    case RingDeviceType.BeamsMultiLevelSwitch:
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
      return device instanceof RingDevice &&
        device.categoryId === RingDeviceCategory.Outlets
        ? Outlet
        : Switch
    case RingDeviceType.TemperatureSensor:
      return TemperatureSensor
    case RingDeviceType.WaterSensor:
      return WaterSensor
    case RingDeviceType.Thermostat:
      return Thermostat
    case RingDeviceType.UnknownZWave:
      return UnknownZWaveSwitchSwitch
  }

  if (/^lock($|\.)/.test(deviceType)) {
    return Lock
  }

  if (deviceType === RingDeviceType.Sensor) {
    // Generic sensor that could be any type of sensor, but should at least have `faulted`
    if (device.name.toLowerCase().includes('motion')) {
      return MotionSensor
    }
    return ContactSensor
  }

  return null
}

export class RingPlatform implements DynamicPlatformPlugin {
  private readonly homebridgeAccessories: {
    [uuid: string]: PlatformAccessory
  } = {}

  constructor(
    public log: Logging,
    public config: PlatformConfig & RingPlatformConfig & RefreshTokenAuth,
    public api: API
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
      if (config.refreshToken) {
        this.connectToApi().catch((e) => {
          this.log.error('Error connecting to API')
          this.log.error(e)
        })
      } else {
        this.log.warn(
          'Plugin is not configured. Visit https://github.com/dgreif/ring/tree/master/homebridge#homebridge-configuration for more information.'
        )
      }
    })

    this.homebridgeAccessories = {}
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(
      `Configuring cached accessory ${accessory.UUID} ${accessory.displayName}`
    )
    this.log.debug('%j', accessory)
    this.homebridgeAccessories[accessory.UUID] = accessory
  }

  async connectToApi() {
    const { api, config } = this,
      systemId = getSystemId(api),
      ringApi = new RingApi({
        controlCenterDisplayName: 'homebridge-ring',
        ...config,
        systemId,
      }),
      locations = await ringApi.getLocations(),
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      platformAccessories: PlatformAccessory[] = [],
      activeAccessoryIds: string[] = []

    this.log.info('Found the following locations:')

    locations.forEach((location) => {
      this.log.info(`  locationId: ${location.id} - ${location.name}`)
    })

    await Promise.all(
      locations.map(async (location) => {
        const devices = await location.getDevices(),
          cameras = location.cameras,
          chimes = location.chimes,
          allDevices = [...devices, ...cameras, ...chimes],
          securityPanel = devices.find(
            (x) => x.deviceType === RingDeviceType.SecurityPanel
          ),
          debugPrefix = debug ? 'TEST ' : '',
          hapDevices = allDevices.map((device) => {
            const isCamera = device instanceof RingCamera,
              cameraIdDifferentiator = isCamera ? 'camera' : '', // this forces bridged cameras from old version of the plugin to be seen as "stale"
              AccessoryClass = (
                device instanceof RingCamera
                  ? Camera
                  : device instanceof RingChime
                  ? Chime
                  : getAccessoryClass(device)
              ) as (new (...args: any[]) => BaseAccessory<any>) | null

            return {
              deviceType: device.deviceType as string,
              device: device as any,
              isCamera,
              id: device.id.toString() + cameraIdDifferentiator,
              name: device.name,
              AccessoryClass,
            }
          }),
          hideDeviceIds = config.hideDeviceIds || [],
          onlyDeviceTypes = config.onlyDeviceTypes?.length
            ? config.onlyDeviceTypes
            : undefined

        if (config.showPanicButtons && securityPanel) {
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
          config.locationModePollingSeconds &&
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
            const uuid = hap.uuid.generate(debugPrefix + id),
              displayName = debugPrefix + name

            if (
              !AccessoryClass ||
              (config.hideLightGroups &&
                deviceType === RingDeviceType.BeamsLightGroupSwitch) ||
              (config.hideUnsupportedServices &&
                unsupportedDeviceTypes.includes(deviceType as any)) ||
              hideDeviceIds.includes(uuid) ||
              (onlyDeviceTypes && !onlyDeviceTypes.includes(deviceType))
            ) {
              if (!ignoreHiddenDeviceTypes.includes(deviceType)) {
                this.log.info(
                  `Hidden accessory ${uuid} ${deviceType} ${displayName}`
                )
              }
              return
            }

            const createHomebridgeAccessory = () => {
                const accessory = new api.platformAccessory(
                  displayName,
                  uuid,
                  isCamera
                    ? hap.Categories.CAMERA
                    : hap.Categories.SECURITY_SYSTEM
                )

                this.log.info(
                  `Adding new accessory ${uuid} ${deviceType} ${displayName}`
                )
                platformAccessories.push(accessory)

                if (
                  isCamera &&
                  typeof hap.Accessory.cleanupAccessoryData === 'function'
                ) {
                  // This is a one-time cleanup that will remove persist files for old external accessories from before camera bridging in version 8
                  hap.Accessory.cleanupAccessoryData(
                    generateMacAddress(accessory.UUID)
                  )
                }

                return accessory
              },
              homebridgeAccessory =
                this.homebridgeAccessories[uuid] || createHomebridgeAccessory(),
              accessory = new AccessoryClass(
                device as any,
                homebridgeAccessory,
                this.log,
                config
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

        updateHomebridgeConfig(this.api, (configContents) => {
          return configContents.replace(oldRefreshToken, newRefreshToken)
        })
      }
    )
  }
}
