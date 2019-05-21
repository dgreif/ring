import { BaseAccessory } from './base-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingAlarmPlatformConfig } from './config'

export class MotionSensor extends BaseAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingAlarmPlatformConfig
  ) {
    super()

    const { MotionSensor } = hap.Service

    this.registerCharacteristic(
      hap.Characteristic.MotionDetected,
      MotionSensor,
      data => data.faulted
    )

    this.initSensorService(MotionSensor)
  }
}
