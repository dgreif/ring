import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class ContactSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
      Characteristic: { ContactSensorState },
      Service,
    } = hap

    this.registerCharacteristic(
      ContactSensorState,
      Service.ContactSensor,
      (data) => {
        return data.faulted
          ? ContactSensorState.CONTACT_NOT_DETECTED
          : ContactSensorState.CONTACT_DETECTED
      }
    )

    this.initSensorService(Service.ContactSensor)
  }
}
