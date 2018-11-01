import RingApi = require('ring-api')
import { AlarmDeviceType, AlarmDevice } from 'ring-api'
import { HAP, hap } from './hap'
import { SecurityPanel } from './security-panel'
import { BaseStation } from './base-station'
import { Keypad } from './keypad'
import { ContactSensor } from './contact-sensor'
import { MotionSensor } from './motion-sensor'

function getAccessoryClass(device: AlarmDevice) {
  switch (device.data.deviceType) {
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
    default:
      return null
  }
}

export class RingAlarmPlatform {
  private readonly homebridgeAccessories: { [uuid: string]: HAP.Accessory } = {}
  public ringApi?: RingApi.Api

  constructor(
    public log: HAP.Log,
    public config: RingApi.Config,
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
    this.ringApi = await RingApi(Object.assign({ poll: false }, this.config))

    const alarms = await this.ringApi.alarms(),
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
