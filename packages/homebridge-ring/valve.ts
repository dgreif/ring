import { BaseDeviceAccessory } from './base-device-accessory'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { PlatformAccessory } from 'homebridge'
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

  isOpen(status: string): boolean {
    logInfo(`Checking if valve is ${status}`)
    if (status === "open") {
      return true;
    }
    return false;
  }

  setOnState(on: boolean) {
    logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)
    if (on) {
      return this.device.sendCommand("valve.open");
    }
    return this.device.sendCommand("valve.close");
  }
}
