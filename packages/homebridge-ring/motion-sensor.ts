import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'

export class MotionSensor extends BaseDeviceAccessory {
  public readonly device
  public readonly accessory
  public readonly config

  constructor(
    device: RingDevice,
    accessory: PlatformAccessory,
    config: RingPlatformConfig,
  ) {
    super()

    this.device = device
    this.accessory = accessory
    this.config = config

    const { Service } = hap

    this.registerCharacteristic({
      characteristicType: hap.Characteristic.MotionDetected,
      serviceType: Service.MotionSensor,
      getValue: (data) => data.faulted,
    })

    this.initSensorService(Service.MotionSensor)
  }
}
