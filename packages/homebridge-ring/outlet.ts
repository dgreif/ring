import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class Outlet extends BaseDeviceAccessory {
  public readonly device
  public readonly accessory
  public readonly config

  constructor(
    device: RingDevice,
    accessory: PlatformAccessory,
    config: RingPlatformConfig,
  ) {
    super()

    this.device = device
    this.accessory = accessory
    this.config = config

    const { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Outlet,
      getValue: (data) => Boolean(data.on),
      setValue: (value) => this.setOnState(value),
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.OutletInUse,
      serviceType: Service.Outlet,
      getValue: (data) => Boolean(data.on),
    })
  }

  setOnState(on: boolean) {
    logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    return this.device.setInfo({ device: { v1: { on } } })
  }
}
