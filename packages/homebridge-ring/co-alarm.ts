import { BaseDeviceAccessory } from './base-device-accessory.js'
import { RingDevice } from 'ring-client-api'
import { hap } from './hap.js'
import { RingPlatformConfig } from './config.js'
import { PlatformAccessory } from 'homebridge'

export class CoAlarm extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const {
      Characteristic: { CarbonMonoxideDetected },
      Service: { CarbonMonoxideSensor },
    } = hap

    this.registerCharacteristic({
      characteristicType: CarbonMonoxideDetected,
      serviceType: CarbonMonoxideSensor,
      getValue: (data) => {
        return data.alarmStatus === 'active'
          ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
          : CarbonMonoxideDetected.CO_LEVELS_NORMAL
      },
    })

    this.initSensorService(CarbonMonoxideSensor)
  }
}
