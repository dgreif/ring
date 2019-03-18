import { AlarmDevice, AlarmDeviceType, getAlarms } from '../api'
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

function getAccessoryClass({ data: { deviceType } }: AlarmDevice) {
  switch (deviceType) {
    case AlarmDeviceType.ContactSensor:
      return ContactSensor
    case AlarmDeviceType.MotionSensor:
      return MotionSensor
    case AlarmDeviceType.SecurityPanel:
      return SecurityPanel
    case AlarmDeviceType.BaseStation:
      return BaseStation
    case AlarmDeviceType.Keypad:
      return Keypad
    case AlarmDeviceType.SmokeAlarm:
      return SmokeAlarm
    case AlarmDeviceType.CoAlarm:
      return CoAlarm
    case AlarmDeviceType.SmokeCoListener:
      return SmokeCoListener
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
    const alarms = await getAlarms(this.config),
      { api } = this,
      cachedAccessoryIds = Object.keys(this.homebridgeAccessories),
      activeAccessoryIds: string[] = []

    await Promise.all(
      alarms.map(async alarm => {
        const devices = await alarm.getDevices()
        this.log.info(
          `Configuring ${devices.length} devices for locationId ${
            alarm.locationId
          }`
        )
        devices.forEach(device => {
          const AccessoryClass = getAccessoryClass(device)

          if (!AccessoryClass) {
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
