import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'
import { hap } from './hap.ts'
import { logInfo } from 'ring-client-api/util'

export class BrightnessOnly extends BaseDeviceAccessory {
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

    const { Characteristic, Service } = hap,
      { context } = accessory

    if (
      device.data.brightness !== undefined &&
      !isNaN(device.data.brightness)
    ) {
      this.registerLevelCharacteristic({
        characteristicType: Characteristic.Brightness,
        serviceType: Service.Lightbulb,
        getValue: (data) => {
          if (!data.brightness || isNaN(data.brightness)) {
            return 0
          }

          // store the brightness so that we can set it again if light is turned off then back on
          context.brightness = data.brightness * 100
          return context.brightness
        },
        setValue: (brightness) => {
          if (brightness) {
            context.brightness = brightness
          }

          return this.setLevelState(brightness)
        },
      })

      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Lightbulb,
        getValue: (data) => Boolean(data.brightness),
        setValue: (on) => {
          const brightness = context.brightness || 100
          return this.setLevelState(on ? brightness : 0)
        },
      })

      this.getService(Service.Lightbulb).setPrimaryService(true)
    }
  }

  setLevelState(brightness: number) {
    logInfo(`Setting brightness of ${this.device.name} to ${brightness}%`)

    return this.device.setInfo({
      device: { v1: { brightness: brightness / 100 } },
    })
  }
}
