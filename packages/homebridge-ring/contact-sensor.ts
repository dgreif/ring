import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'

export class ContactSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const {
      Characteristic: { ContactSensorState },
      Service,
    } = hap

    this.registerCharacteristic({
      characteristicType: ContactSensorState,
      serviceType: Service.ContactSensor,
      getValue: (data) => {
        return data.faulted
          ? ContactSensorState.CONTACT_NOT_DETECTED
          : ContactSensorState.CONTACT_DETECTED
      },
    })

    this.initSensorService(Service.ContactSensor)
  }
}
