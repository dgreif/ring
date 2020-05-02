import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, map } from 'rxjs/operators'
import { Logging, PlatformAccessory } from 'homebridge'

export class TemperatureSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
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
