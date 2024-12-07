import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import { RingPlatformConfig } from './config.ts'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class WaterSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
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
        distinctUntilChanged(),
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
        logInfo(device.name + ' Detected Water')
      })
  }
}
