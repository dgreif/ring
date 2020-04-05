import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'

export class FreezeSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
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
    onFreezeDetected.pipe(filter((faulted) => faulted)).subscribe(() => {
      this.logger.info(device.name + ' Detected Freezing')
    })
  }
}
