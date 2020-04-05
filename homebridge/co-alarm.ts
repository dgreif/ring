import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class CoAlarm extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
      Characteristic: { CarbonMonoxideDetected },
      Service: { CarbonMonoxideSensor },
    } = hap

    this.registerCharacteristic(
      CarbonMonoxideDetected,
      CarbonMonoxideSensor,
      (data) => {
        return data.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      }
    )

    this.initSensorService(CarbonMonoxideSensor)
  }
}
