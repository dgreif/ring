import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class Switch extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    this.registerCharacteristic(
      Characteristic.On,
      Service.Switch,
      (data) => Boolean(data.on),
      (value) => this.setOnState(value)
    )
  }

  setOnState(on: boolean) {
    this.logger.info(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    return this.device.setInfo({ device: { v1: { on } } })
  }
}
