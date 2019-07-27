import { RingApi, RingCamera, RingDevice, RingDeviceType } from '../api'
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
import { RingPlatformConfig } from './config'
import { Beam } from './beam'
import { MultiLevelSwitch } from './multi-level-switch'
import { Switch } from './switch'
import { Camera } from './camera'
import { RingAuth } from '../api/rest-client'
import { platformName, pluginName } from './plugin-info'

const debug = __filename.includes('release-homebridge')

process.env.RING_DEBUG = debug ? 'true' : ''

function getAccessoryClass(device: RingDevice | RingCamera) {
  const { deviceType } = device

  switch (deviceType) {
    case RingDeviceType.ContactSensor:
      return ContactSensor
    case RingDeviceType.MotionSensor:
      return MotionSensor
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
    case RingDeviceType.MultiLevelBulb:
      return MultiLevelSwitch
    case RingDeviceType.Switch:
      return Switch
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
    public config: RingPlatformConfig & RingAuth,
    public api: HAP.Platform
  ) {
    if (!config) {
      this.log.info('No configuration found for platform Ring')
      return
    }

    config.cameraStatusPollingSeconds = config.cameraStatusPollingSeconds || 20
    config.cameraDingsPollingSeconds = config.cameraDingsPollingSeconds || 2

    this.api.on('didFinishLaunching', () => {
      this.log.debug('didFinishLaunching')
      this.connectToApi().catch(e => {
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
    const ringApi = new RingApi(this.config),
      locations = await ringApi.getLocations(),
      { api } = this,
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      platformAccessories: HAP.Accessory[] = [],
      cameraAccessories: HAP.Accessory[] = [],
      activeAccessoryIds: string[] = []

    await Promise.all(
      locations.map(async location => {
        const devices = await location.getDevices(),
          cameras = location.cameras,
          allDevices = [...devices, ...cameras]

        this.log.info(
          `Configuring ${cameras.length} cameras and ${devices.length} devices for locationId ${location.locationId}`
        )
        allDevices.forEach(device => {
          const isCamera = device instanceof RingCamera,
            AccessoryClass = isCamera ? Camera : getAccessoryClass(device),
            debugPrefix = debug ? 'TEST ' : '',
            cameraIdDifferentiator = isCamera ? 'camera' : '', // this forces bridged cameras from old version of the plugin to be seen as "stale"
            id = debugPrefix + device.id.toString() + cameraIdDifferentiator,
            uuid = hap.UUIDGen.generate(id)

          if (
            !AccessoryClass ||
            (this.config.hideLightGroups &&
              device.deviceType === RingDeviceType.BeamsLightGroupSwitch)
          ) {
            return
          }

          const createHomebridgeAccessory = () => {
              const accessory = new hap.PlatformAccessory(
                debugPrefix + device.name,
                uuid,
                isCamera
                  ? hap.AccessoryCategories.CAMERA
                  : hap.AccessoryCategories.SECURITY_SYSTEM
              )

              this.log.info(
                `Adding new accessory ${device.deviceType} ${debugPrefix +
                  device.name}`
              )

              if (isCamera) {
                cameraAccessories.push(accessory)
              } else {
                platformAccessories.push(accessory)
              }

              return accessory
            },
            homebridgeAccessory =
              this.homebridgeAccessories[uuid] || createHomebridgeAccessory()

          new AccessoryClass(
            device as any,
            homebridgeAccessory,
            this.log,
            this.config
          )

          this.homebridgeAccessories[uuid] = homebridgeAccessory
          activeAccessoryIds.push(uuid)
        })
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
      .filter(cachedId => !activeAccessoryIds.includes(cachedId))
      .map(id => this.homebridgeAccessories[id])

    staleAccessories.forEach(staleAccessory => {
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
  }
}
