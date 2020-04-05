import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, map } from 'rxjs/operators'

export class TemperatureSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
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
        distinctUntilChanged()
      ),
    })

    this.initSensorService(TempSensorService)
  }
}
