import { BaseDeviceAccessory } from './base-device-accessory.ts'
import { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import { RingPlatformConfig } from './config.ts'
import { PlatformAccessory } from 'homebridge'

export class SmokeCoListener extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const {
      Characteristic: { SmokeDetected, CarbonMonoxideDetected },
      Service: { SmokeSensor, CarbonMonoxideSensor },
    } = hap

    this.registerCharacteristic({
      characteristicType: SmokeDetected,
      serviceType: SmokeSensor,
      getValue: (data) => {
        return data.smoke && data.smoke.alarmStatus === 'active'
          ? SmokeDetected.SMOKE_DETECTED
          : SmokeDetected.SMOKE_NOT_DETECTED
      },
    })
    this.registerCharacteristic({
      characteristicType: CarbonMonoxideDetected,
      serviceType: CarbonMonoxideSensor,
      getValue: (data) => {
        return data.co && data.co.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      },
    })

    this.initSensorService(SmokeSensor)
    this.initSensorService(CarbonMonoxideSensor)
  }
}
