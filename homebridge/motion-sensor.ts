import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'

export class MotionSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
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
