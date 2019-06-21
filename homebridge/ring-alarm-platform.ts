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
import { RingAlarmPlatformConfig } from './config'
import { Beam } from './beam'
import { MultiLevelSwitch } from './multi-level-switch'
import { Camera } from './camera'

const pluginName = 'homebridge-ring-alarm',
  platformName = 'RingAlarm'

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
      return MultiLevelSwitch
  }

  if (/^lock($|\.)/.test(deviceType)) {
    return Lock
  }

  return null
}

export class RingAlarmPlatform {
  private readonly homebridgeAccessories: { [uuid: string]: HAP.Accessory } = {}

  constructor(
    public log: HAP.Log,
    public config: RingAlarmPlatformConfig,
    public api: HAP.Platform
  ) {
    config.cameraStatusPollingSeconds = config.cameraStatusPollingSeconds || 30
    config.cameraDingsPollingSeconds = config.cameraDingsPollingSeconds || 5

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
            id = device.id,
            uuid = hap.UUIDGen.generate(id.toString()),
            existingAccessory = this.homebridgeAccessories[uuid]

          if (
            !AccessoryClass ||
            (this.config.hideLightGroups &&
              device.deviceType === RingDeviceType.BeamsLightGroupSwitch)
          ) {
            return
          }

          if (
            isCamera &&
            existingAccessory &&
            existingAccessory.category === 11
          ) {
            // this will remove bridged cameras from older versions of the plugin
            this.removeAccessories([this.homebridgeAccessories[uuid]])
            delete this.homebridgeAccessories[uuid]
          }

          const createHomebridgeAccessory = () => {
              const accessory = new hap.PlatformAccessory(
                device.name,
                uuid,
                isCamera
                  ? hap.AccessoryCategories.CAMERA
                  : hap.AccessoryCategories.SECURITY_SYSTEM
              )

              this.log.info(
                `Adding new accessory ${device.deviceType} ${device.name}`
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
      this.removeAccessories(staleAccessories)
    }
  }

  private removeAccessories(accessories: HAP.Accessory[]) {
    this.api.unregisterPlatformAccessories(
      pluginName,
      platformName,
      accessories
    )
  }
}
