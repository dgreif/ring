import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from '../api'
import { HAP, hap } from './hap'
import { RingAlarmPlatformConfig } from './config'

export class ContactSensor extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingAlarmPlatformConfig
  ) {
    super()

    const {
      Characteristic: { ContactSensorState },
      Service: { ContactSensor }
    } = hap

    this.registerCharacteristic(ContactSensorState, ContactSensor, data => {
      return data.faulted
        ? ContactSensorState.CONTACT_NOT_DETECTED
        : ContactSensorState.CONTACT_DETECTED
    })

    this.initSensorService(ContactSensor)
  }
}
