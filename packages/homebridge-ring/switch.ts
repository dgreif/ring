import { BaseDeviceAccessory } from './base-device-accessory'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class Switch extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Switch,
      getValue: (data) => Boolean(data.on),
      setValue: (value) => this.setOnState(value),
    })
  }

  setOnState(on: boolean) {
    logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    return this.device.setInfo({ device: { v1: { on } } })
  }
}
