import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'

export class Fan extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap,
      { data: initialData } = this.device

    this.registerCharacteristic(
      Characteristic.On,
      Service.Fan,
      (data) => Boolean(data.on),
      (value) => this.setOnState(value)
    )

    if (initialData.level !== undefined) {
      this.registerLevelCharacteristic(
        Characteristic.RotationSpeed,
        Service.Fan,
        (data) => (data.level && !isNaN(data.level) ? 100 * data.level : 0),
        (value) => this.setLevelState(value)
      )
    }
  }

  setOnState(on: boolean) {
    this.logger.info(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    return this.device.setInfo({ device: { v1: { on } } })
  }

  setLevelState(level: number) {
    this.logger.info(`Setting speed of ${this.device.name} to ${level}%`)

    return this.device.setInfo({
      device: { v1: { level: level / 100 } },
    })
  }
}
