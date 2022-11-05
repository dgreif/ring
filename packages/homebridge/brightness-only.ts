import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { RingPlatformConfig } from './config'
import { PlatformAccessory } from 'homebridge'
import { hap } from './hap'
import { logInfo } from '../api/util'

export class BrightnessOnly extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig
  ) {
    super()

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
