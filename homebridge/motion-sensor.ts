import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class MotionSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Service } = hap

    this.registerCharacteristic(
      hap.Characteristic.MotionDetected,
      Service.MotionSensor,
      (data) => data.faulted
    )

    this.initSensorService(Service.MotionSensor)
  }
}
