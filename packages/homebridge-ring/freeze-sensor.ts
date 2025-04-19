import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import type { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class FreezeSensor extends BaseDeviceAccessory {
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
        Characteristic: { OccupancyDetected },
        Service: { OccupancySensor },
      } = hap,
      onFreezeDetected = device.onData.pipe(
        map((data) => {
          return data.faulted
            ? OccupancyDetected.OCCUPANCY_DETECTED
            : OccupancyDetected.OCCUPANCY_NOT_DETECTED
        }),
        distinctUntilChanged(),
      )

    this.initSensorService(OccupancySensor)
    this.registerObservableCharacteristic({
      characteristicType: OccupancyDetected,
      serviceType: OccupancySensor,
      onValue: onFreezeDetected,
    })
    onFreezeDetected
      .pipe(filter((faulted) => Boolean(faulted)))
      .subscribe(() => {
        logInfo(device.name + ' Detected Freezing')
      })
  }
}
