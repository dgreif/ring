import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'

export class SmokeAlarm extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const {
      Characteristic: { SmokeDetected },
      Service: { SmokeSensor },
    } = hap

    this.registerCharacteristic({
      characteristicType: SmokeDetected,
      serviceType: SmokeSensor,
      getValue: (data) => {
        return data.alarmStatus === 'active'
          ? SmokeDetected.SMOKE_DETECTED
          : SmokeDetected.SMOKE_NOT_DETECTED
      },
    })

    this.initSensorService(SmokeSensor)
  }
}
