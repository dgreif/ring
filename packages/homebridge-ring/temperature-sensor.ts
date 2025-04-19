import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import { distinctUntilChanged, map } from 'rxjs/operators'
import type { PlatformAccessory } from 'homebridge'

export class TemperatureSensor extends BaseDeviceAccessory {
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

    const {
      Characteristic: { CurrentTemperature },
      Service: { TemperatureSensor: TempSensorService },
    } = hap

    this.registerObservableCharacteristic({
      characteristicType: CurrentTemperature,
      serviceType: TempSensorService,
      onValue: device.onData.pipe(
        map((data) => {
          return data.celsius!
        }),
        distinctUntilChanged(),
      ),
    })

    this.initSensorService(TempSensorService)
  }
}
