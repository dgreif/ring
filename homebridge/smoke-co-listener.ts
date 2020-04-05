import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class SmokeCoListener extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
      Characteristic: { SmokeDetected, CarbonMonoxideDetected },
      Service: { SmokeSensor, CarbonMonoxideSensor },
    } = hap

    this.registerCharacteristic(SmokeDetected, SmokeSensor, (data) => {
      return data.smoke && data.smoke.alarmStatus === 'active'
        ? SmokeDetected.SMOKE_DETECTED
        : SmokeDetected.SMOKE_NOT_DETECTED
    })
    this.registerCharacteristic(
      CarbonMonoxideDetected,
      CarbonMonoxideSensor,
      (data) => {
        return data.co && data.co.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      }
    )

    this.initSensorService(SmokeSensor)
    this.initSensorService(CarbonMonoxideSensor)
  }
}
