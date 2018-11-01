import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from 'ring-api'
import { HAP, hap } from './hap'

export class MotionSensor extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
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
