import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class SmokeAlarm extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
      Characteristic: { SmokeDetected },
      Service: { SmokeSensor },
    } = hap

    this.registerCharacteristic(SmokeDetected, SmokeSensor, (data) => {
      return data.alarmStatus === 'active'
        ? SmokeDetected.SMOKE_DETECTED
        : SmokeDetected.SMOKE_NOT_DETECTED
    })

    this.initSensorService(SmokeSensor)
  }
}
