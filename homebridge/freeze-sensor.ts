import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { Logging, PlatformAccessory } from 'homebridge'

export class FreezeSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

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
        distinctUntilChanged()
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
        this.logger.info(device.name + ' Detected Freezing')
      })
  }
}
