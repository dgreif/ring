import { RingDevice, RingDeviceData, AlarmState } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { BaseDataAccessory } from './base-data-accessory'
import { Logging, PlatformAccessory } from 'homebridge'

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
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap,
      locationName = device.location.name

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Switch,
      serviceSubType: 'Burglar',
      name: 'Burglar Alarm',
      getValue: (data) => matchesAnyAlarmState(data, burglarStates),
      setValue: (on) => {
        if (on) {
          this.logger.info(`Burglar Alarm activated for ${locationName}`)
          return this.device.location.triggerBurglarAlarm()
        }

        this.logger.info(`Burglar Alarm turned off for ${locationName}`)
        return this.device.location.setAlarmMode('none')
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Switch,
      serviceSubType: 'Fire',
      name: 'Fire Alarm',
      getValue: (data) => matchesAnyAlarmState(data, fireStates),
      setValue: (on) => {
        if (on) {
          this.logger.info(`Fire Alarm activated for ${locationName}`)
          return this.device.location.triggerFireAlarm()
        }

        this.logger.info(`Fire Alarm turned off for ${locationName}`)
        return this.device.location.setAlarmMode('none')
      },
    })
  }

  initBase() {
    const { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.manufacturerName || 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Panic Buttons for ' + this.device.location.name,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'None',
    })

    super.initBase()
  }
}
