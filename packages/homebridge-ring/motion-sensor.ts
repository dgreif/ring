import { BaseDeviceAccessory } from './base-device-accessory.js'
import { RingDevice } from 'ring-client-api'
import { hap } from './hap.js'
import { RingPlatformConfig } from './config.js'
import { PlatformAccessory } from 'homebridge'

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
