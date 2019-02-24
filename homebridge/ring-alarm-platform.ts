import {
  AlarmDevice,
  AlarmDeviceType,
  getAlarms,
  RingAlarmOptions
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
    public config: RingAlarmOptions,
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
      'Configuring cached accessory: [%s] %s',
      accessory.displayName,
      accessory.UUID
    )
    this.log.debug('%j', accessory)
    this.homebridgeAccessories[accessory.UUID] = accessory
  }

  async connectToApi() {
    const alarms = await getAlarms(this.config),
      { api } = this

    return Promise.all(
      alarms.map(async alarm => {
        const devices = await alarm.getDevices()
        devices.forEach(device => {
          const AccessoryClass = getAccessoryClass(device)

          if (!AccessoryClass) {
            return
          }

          const id = device.data.zid,
            uuid = hap.UUIDGen.generate(id),
            createHomebridgeAccessory = () => {
              const accessory = new hap.PlatformAccessory(
                device.data.name,
                uuid,
                hap.AccessoryCategories.SECURITY_SYSTEM
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

          new AccessoryClass(device, homebridgeAccessory)

          this.homebridgeAccessories[uuid] = homebridgeAccessory
        })
      })
    )
  }
}
