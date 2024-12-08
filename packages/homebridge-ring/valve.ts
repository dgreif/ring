import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class Valve extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    const { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Switch,
      getValue: (data) => this.isOpen(data.valveState),
      setValue: (value) => this.setOnState(value),
    })
  }

  isOpen(status: RingDevice['data']['valveState']): boolean {
    if (status === 'open') {
      return true
    }
    return false
  }

  setOnState(on: boolean) {
    logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)
    if (on) {
      return this.device.sendCommand('valve.open')
    }
    return this.device.sendCommand('valve.close')
  }
}
