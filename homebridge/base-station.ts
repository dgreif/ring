import { BaseAccessory } from './base-accessory'
import { AlarmDevice } from '../api'
import { HAP } from './hap'

export class BaseStation extends BaseAccessory {
  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()
  }
}
