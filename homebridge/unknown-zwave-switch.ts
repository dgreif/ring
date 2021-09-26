import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'

export class UnknownZWaveSwitchSwitch extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Switch,
      getValue: (data) => Boolean(data.basicValue),
      setValue: (value) => this.setOnState(value),
    })
  }

  setOnState(on: boolean) {
    this.logger.info(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    return this.device.setInfo({ device: { v1: { basicValue: on ? 255 : 0 } } })
  }
}
