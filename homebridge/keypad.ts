import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from '../api'
import { HAP } from './hap'

export class Keypad extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log
  ) {
    super()
  }
}
