import { BaseDeviceAccessory } from './base-device-accessory.ts'
import { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import { RingPlatformConfig } from './config.ts'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { PlatformAccessory } from 'homebridge'

export class TemperatureSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

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
