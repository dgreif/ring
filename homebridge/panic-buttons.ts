import { RingDevice, RingDeviceData, AlarmState } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { BaseDataAccessory } from './base-data-accessory'

const burglarStates: AlarmState[] = [
    'burglar-alarm',
    'user-verified-burglar-alarm',
    'burglar-accelerated-alarm',
  ],
  fireStates: AlarmState[] = [
    'fire-alarm',
    'user-verified-co-or-fire-alarm',
    'fire-accelerated-alarm',
  ]

function matchesAnyAlarmState(
  { alarmInfo }: RingDeviceData,
  targetStates: AlarmState[]
) {
  return Boolean(alarmInfo && targetStates.includes(alarmInfo.state))
}

export class PanicButtons extends BaseDataAccessory<RingDevice> {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap,
      locationName = device.location.name

    this.registerCharacteristic(
      Characteristic.On,
      this.getService(Service.Switch, 'Burglar Alarm', 'Burglar'),
      (data) => matchesAnyAlarmState(data, burglarStates),
      (on) => {
        if (on) {
          this.logger.info(`Burglar Alarm activated for ${locationName}`)
          return this.device.location.triggerBurglarAlarm()
        }

        this.logger.info(`Burglar Alarm turned off for ${locationName}`)
        return this.device.location.setAlarmMode('none')
      }
    )

    this.registerCharacteristic(
      Characteristic.On,
      this.getService(Service.Switch, 'Fire Alarm', 'Fire'),
      (data) => matchesAnyAlarmState(data, fireStates),
      (on) => {
        if (on) {
          this.logger.info(`Fire Alarm activated for ${locationName}`)
          return this.device.location.triggerFireAlarm()
        }

        this.logger.info(`Fire Alarm turned off for ${locationName}`)
        return this.device.location.setAlarmMode('none')
      }
    )
  }

  initBase() {
    const { Characteristic, Service } = hap

    this.registerCharacteristic(
      Characteristic.Manufacturer,
      Service.AccessoryInformation,
      (data) => data.manufacturerName || 'Ring'
    )
    this.registerCharacteristic(
      Characteristic.Model,
      Service.AccessoryInformation,
      () => 'Panic Buttons for ' + this.device.location.name
    )
    this.registerCharacteristic(
      Characteristic.SerialNumber,
      Service.AccessoryInformation,
      () => 'None'
    )

    super.initBase()
  }
}
