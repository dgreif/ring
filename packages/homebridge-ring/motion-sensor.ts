import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'

export class MotionSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const { Service } = hap

    this.registerCharacteristic({
      characteristicType: hap.Characteristic.MotionDetected,
      serviceType: Service.MotionSensor,
      getValue: (data) => data.faulted,
    })

    this.initSensorService(Service.MotionSensor)
  }
}
