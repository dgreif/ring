import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from '../api'
import { HAP } from './hap'
import { RingAlarmPlatformConfig } from './config'

export class Keypad extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingAlarmPlatformConfig
  ) {
    super()
  }
}
