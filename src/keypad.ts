import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from 'ring-api'
import { HAP } from './hap'

export class Keypad extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()
  }
}
