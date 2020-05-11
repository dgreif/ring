import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { Logging, PlatformAccessory } from 'homebridge'

export class WaterSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
        Characteristic: { LeakDetected },
      } = hap,
      leakService = this.getService(hap.Service.LeakSensor),
      onWaterDetected = device.onData.pipe(
        map((data) => {
          return data.faulted
            ? LeakDetected.LEAK_DETECTED
            : LeakDetected.LEAK_NOT_DETECTED
        }),
        distinctUntilChanged()
      )

    this.initSensorService(leakService)
    this.registerObservableCharacteristic({
      characteristicType: LeakDetected,
      serviceType: leakService,
      onValue: onWaterDetected,
    })
    onWaterDetected
      .pipe(filter((faulted) => Boolean(faulted)))
      .subscribe(() => {
        this.logger.info(device.name + ' Detected Water')
      })
  }
}
