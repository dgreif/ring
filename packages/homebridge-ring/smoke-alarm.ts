import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'

export class SmokeAlarm extends BaseDeviceAccessory {
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
