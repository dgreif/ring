import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from 'ring-api'
import { HAP, hap } from './hap'

export class ContactSensor extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
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
