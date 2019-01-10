import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from 'ring-api'
import { HAP, hap } from './hap'

export class SmokeAlarm extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()

    const {
      Characteristic: { SmokeDetected },
      Service: { SmokeSensor }
    } = hap

    this.registerCharacteristic(SmokeDetected, SmokeSensor, data => {
      return data.alarmStatus === 'active'
        ? SmokeDetected.SMOKE_DETECTED
        : SmokeDetected.SMOKE_NOT_DETECTED
    })

    this.initSensorService(SmokeSensor)
  }
}
