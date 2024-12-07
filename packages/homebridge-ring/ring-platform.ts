import {
  RingApi,
  RingCamera,
  RingChime,
  RingDevice,
  RingDeviceCategory,
  RingDeviceType,
  RingIntercom,
} from 'ring-client-api'
import { hap } from './hap.js'
import {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge'
import { SecurityPanel } from './security-panel.js'
import { Chime } from './chime.js'
import { BrightnessOnly } from './brightness-only.js'
import { ContactSensor } from './contact-sensor.js'
import { MotionSensor } from './motion-sensor.js'
import { Lock } from './lock.js'
import { SmokeAlarm } from './smoke-alarm.js'
import { CoAlarm } from './co-alarm.js'
import { SmokeCoListener } from './smoke-co-listener.js'
import {
  controlCenterDisplayName,
  debug,
  getSystemId,
  RingPlatformConfig,
  updateHomebridgeConfig,
} from './config.js'
import { Beam } from './beam.js'
import { MultiLevelSwitch } from './multi-level-switch.js'
import { Fan } from './fan.js'
import { Outlet } from './outlet.js'
import { Switch } from './switch.js'
import { Camera } from './camera.js'
import { PanicButtons } from './panic-buttons.js'
import { RefreshTokenAuth } from 'ring-client-api/rest-client'
import { logError, logInfo, useLogger } from 'ring-client-api/util'
import { BaseAccessory } from './base-accessory.js'
import { FloodFreezeSensor } from './flood-freeze-sensor.js'
import { FreezeSensor } from './freeze-sensor.js'
import { TemperatureSensor } from './temperature-sensor.js'
import { WaterSensor } from './water-sensor.js'
import { LocationModeSwitch } from './location-mode-switch.js'
import { Thermostat } from './thermostat.js'
import { UnknownZWaveSwitchSwitch } from './unknown-zwave-switch.js'
import { generateMacAddress } from './util.js'
import { Intercom } from './intercom.js'
import { Valve } from './valve.js'

const ignoreHiddenDeviceTypes: string[] = [
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

function getAccessoryClass(
  device: RingDevice,
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
    case RingDeviceType.BaseStationPro:
    case RingDeviceType.Keypad:
      return BrightnessOnly
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
    case RingDeviceType.WaterValve:
      return Valve
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
    public api: API,
  ) {
    if (!config.disableLogs) {
      useLogger({
        logInfo(message) {
          log.info(message)
        },
        logError(message) {
          log.error(message)
        },
      })
    }

    if (!config) {
      logInfo('No configuration found for platform Ring')
      return
    }

    config.cameraStatusPollingSeconds = config.cameraStatusPollingSeconds ?? 20
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
          'Plugin is not configured. Visit https://github.com/dgreif/ring/tree/main/packages/homebridge-ring#homebridge-configuration for more information.',
        )
      }
    })

    this.homebridgeAccessories = {}
  }

  configureAccessory(accessory: PlatformAccessory) {
    logInfo(
      `Configuring cached accessory ${accessory.UUID} ${accessory.displayName}`,
    )
    this.log.debug('%j', accessory)
    this.homebridgeAccessories[accessory.UUID] = accessory
  }

  async connectToApi() {
    const { api, config } = this,
      systemId = getSystemId(api.user.storagePath()),
      ringApi = new RingApi({
        controlCenterDisplayName,
        ...config,
        systemId,
      }),
      locations = await ringApi.getLocations(),
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      platformAccessories: PlatformAccessory[] = [],
      externalAccessories: PlatformAccessory[] = [],
      activeAccessoryIds: string[] = []
    let hasBridgedCameras = false

    logInfo('Found the following locations:')

    locations.forEach((location) => {
      logInfo(`  locationId: ${location.id} - ${location.name}`)
    })

    await Promise.all(
      locations.map(async (location) => {
        const devices = await location.getDevices(),
          { cameras, chimes, intercoms } = location,
          allDevices = [...devices, ...cameras, ...chimes, ...intercoms],
          securityPanel = devices.find(
            (x) => x.deviceType === RingDeviceType.SecurityPanel,
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
                  : device instanceof RingIntercom
                  ? Intercom
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

        logInfo(
          `Configuring ${cameras.length} cameras and ${hapDevices.length} devices for location "${location.name}" - locationId: ${location.id}`,
        )
        hapDevices.forEach(
          ({ deviceType, device, isCamera, id, name, AccessoryClass }) => {
            const uuid = hap.uuid.generate(debugPrefix + id),
              displayName = debugPrefix + name,
              isExternalCamera = isCamera && this.config.unbridgeCameras

            if (
              !AccessoryClass ||
              (config.hideLightGroups &&
                deviceType === RingDeviceType.BeamsLightGroupSwitch) ||
              hideDeviceIds.includes(uuid) ||
              (onlyDeviceTypes && !onlyDeviceTypes.includes(deviceType))
            ) {
              if (!ignoreHiddenDeviceTypes.includes(deviceType)) {
                logInfo(`Hidden accessory ${uuid} ${deviceType} ${displayName}`)
              }
              return
            }

            if (isExternalCamera && this.homebridgeAccessories[uuid]) {
              // Camera was previously bridged.  Remove it from the platform so that it can be added as an external accessory
              this.log.warn(
                `Camera ${displayName} was previously bridged. You will need to manually pair it as a new accessory.`,
              )
              this.api.unregisterPlatformAccessories(pluginName, platformName, [
                this.homebridgeAccessories[uuid],
              ])
              delete this.homebridgeAccessories[uuid]
            }

            const createHomebridgeAccessory = () => {
                const accessory = new api.platformAccessory(
                  displayName,
                  uuid,
                  isCamera
                    ? hap.Categories.CAMERA
                    : hap.Categories.SECURITY_SYSTEM,
                )

                if (isExternalCamera) {
                  logInfo(
                    `Configured camera ${uuid} ${deviceType} ${displayName}`,
                  )
                  externalAccessories.push(accessory)
                } else {
                  logInfo(
                    `Adding new accessory ${uuid} ${deviceType} ${displayName}`,
                  )
                  platformAccessories.push(accessory)
                }

                if (
                  isCamera &&
                  !isExternalCamera &&
                  typeof hap.Accessory.cleanupAccessoryData === 'function'
                ) {
                  // This is a one-time cleanup that will remove persist files for old external accessories from unbridged cameras
                  hap.Accessory.cleanupAccessoryData(
                    generateMacAddress(accessory.UUID),
                  )
                }

                return accessory
              },
              homebridgeAccessory =
                this.homebridgeAccessories[uuid] || createHomebridgeAccessory(),
              accessory = new AccessoryClass(
                device as any,
                homebridgeAccessory,
                config,
              )
            accessory.initBase()

            this.homebridgeAccessories[uuid] = homebridgeAccessory
            activeAccessoryIds.push(uuid)

            hasBridgedCameras ||= isCamera && !isExternalCamera
          },
        )
      }),
    )

    if (platformAccessories.length) {
      api.registerPlatformAccessories(
        pluginName,
        platformName,
        platformAccessories,
      )
    }

    if (externalAccessories.length) {
      api.publishExternalAccessories(pluginName, externalAccessories)
    }

    const staleAccessories = cachedAccessoryIds
      .filter((cachedId) => !activeAccessoryIds.includes(cachedId))
      .map((id) => this.homebridgeAccessories[id])

    staleAccessories.forEach((staleAccessory) => {
      logInfo(
        `Removing stale cached accessory ${staleAccessory.UUID} ${staleAccessory.displayName}`,
      )
    })

    if (staleAccessories.length) {
      this.api.unregisterPlatformAccessories(
        pluginName,
        platformName,
        staleAccessories,
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
      },
    )

    if (hasBridgedCameras) {
      logError(
        'Bridged camera support will be removed in the next major release of homebridge-ring. Please enable the unbridgeCameras option in your configuration and add the individual cameras to HomeKit to prepare for this change.',
      )
    }
  }
}
