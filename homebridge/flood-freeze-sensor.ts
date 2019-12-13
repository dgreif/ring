import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class FloodFreezeSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
      Characteristic: { LeakDetected, ContactSensorState },
      Service: { LeakSensor, CarbonMonoxideSensor }
    } = hap

    this.registerCharacteristic(
      LeakDetected,
      LeakSensor,
      data => {
        return data.flood && data.flood.faulted
          ? LeakDetected.LEAK_DETECTED
          : LeakDetected.LEAK_NOT_DETECTED
      },
      undefined,
      undefined,
      'Flood Sensor'
    )
    this.registerCharacteristic(
      ContactSensorState,
      CarbonMonoxideSensor,
      data => {
        return data.freeze && data.freeze.faulted
          ? ContactSensorState.CONTACT_NOT_DETECTED
          : ContactSensorState.CONTACT_DETECTED
      },
      undefined,
      undefined,
      'Freeze Sensor'
    )

    this.initSensorService(LeakSensor)
    this.initSensorService(ContactSensorState)
  }
}
