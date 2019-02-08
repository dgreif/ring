import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from '../api'
import { HAP, hap } from './hap'

export class SmokeCoListener extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()

    const {
      Characteristic: { SmokeDetected, CarbonMonoxideDetected },
      Service: { SmokeSensor, CarbonMonoxideSensor }
    } = hap

    this.registerCharacteristic(SmokeDetected, SmokeSensor, data => {
      return data.smoke && data.smoke.alarmStatus === 'active'
        ? SmokeDetected.SMOKE_DETECTED
        : SmokeDetected.SMOKE_NOT_DETECTED
    })
    this.registerCharacteristic(
      CarbonMonoxideDetected,
      CarbonMonoxideSensor,
      data => {
        return data.co && data.co.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      }
    )

    this.initSensorService(SmokeSensor)
    this.initSensorService(CarbonMonoxideSensor)
  }
}
