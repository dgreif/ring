import { getLocations, RingDevice, RingDeviceType } from '../api'
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

function getAccessoryClass({ data: { deviceType } }: RingDevice) {
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
    const locations = await getLocations(this.config),
      { api } = this,
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      activeAccessoryIds: string[] = []

    await Promise.all(
      locations.map(async location => {
        const devices = await location.getDevices()
        this.log.info(
          `Configuring ${devices.length} devices for locationId ${
            location.locationId
          }`
        )
        devices.forEach(device => {
          const AccessoryClass = getAccessoryClass(device)

          if (
            !AccessoryClass ||
            (this.config.hideLightGroups &&
              device.data.deviceType === RingDeviceType.BeamsLightGroupSwitch)
          ) {
            return
          }

          const id = device.data.zid,
            uuid = hap.UUIDGen.generate(id),
            createHomebridgeAccessory = () => {
              const accessory = new hap.PlatformAccessory(
                device.name,
                uuid,
                hap.AccessoryCategories.SECURITY_SYSTEM
              )

              this.log.info(
                `Adding new accessory ${device.data.deviceType} ${device.name}`
              )

              api.registerPlatformAccessories(
                'homebridge-ring-alarm',
                'RingAlarm',
                [accessory]
              )
              return accessory
            },
            homebridgeAccessory =
              this.homebridgeAccessories[uuid] || createHomebridgeAccessory()

          new AccessoryClass(device, homebridgeAccessory, this.log, this.config)

          this.homebridgeAccessories[uuid] = homebridgeAccessory
          activeAccessoryIds.push(uuid)
        })
      })
    )

    const staleAccessories = cachedAccessoryIds
      .filter(cachedId => !activeAccessoryIds.includes(cachedId))
      .map(id => this.homebridgeAccessories[id])

    staleAccessories.forEach(staleAccessory => {
      this.log.info(
        `Removing stale cached accessory ${staleAccessory.UUID} ${
          staleAccessory.displayName
        }`
      )
    })

    if (staleAccessories.length) {
      this.api.unregisterPlatformAccessories(
        'homebridge-ring-alarm',
        'RingAlarm',
        staleAccessories
      )
    }
  }
}
