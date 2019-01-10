import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from 'ring-api'
import { HAP, hap } from './hap'

export class CoAlarm extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()

    const {
      Characteristic: { CarbonMonoxideDetected },
      Service: { CarbonMonoxideSensor }
    } = hap

    this.registerCharacteristic(
      CarbonMonoxideDetected,
      CarbonMonoxideSensor,
      data => {
        return data.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      }
    )

    this.initSensorService(CarbonMonoxideSensor)
  }
}
