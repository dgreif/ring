import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'

export class FloodFreezeSensor extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const {
        Characteristic: { LeakDetected, OccupancyDetected },
        Service: { LeakSensor, OccupancySensor },
      } = hap,
      leakService = this.getService(LeakSensor, `${device.name} Flood Sensor`),
      freezeService = this.getService(
        OccupancySensor,
        `${device.name} Freeze Sensor`
      ),
      onFloodDetected = device.onData.pipe(
        map((data) => {
          return data.flood && data.flood.faulted
            ? LeakDetected.LEAK_DETECTED
            : LeakDetected.LEAK_NOT_DETECTED
        }),
        distinctUntilChanged()
      ),
      onFreezeDetected = device.onData.pipe(
        map((data) => {
          return data.freeze && data.freeze.faulted
            ? OccupancyDetected.OCCUPANCY_DETECTED
            : OccupancyDetected.OCCUPANCY_NOT_DETECTED
        }),
        distinctUntilChanged()
      )

    this.initSensorService(leakService)
    this.registerObservableCharacteristic({
      characteristicType: LeakDetected,
      serviceType: leakService,
      onValue: onFloodDetected,
    })
    onFloodDetected.pipe(filter((faulted) => faulted)).subscribe(() => {
      this.logger.info(device.name + ' Detected Flooding')
    })

    this.initSensorService(freezeService)
    this.registerObservableCharacteristic({
      characteristicType: OccupancyDetected,
      serviceType: freezeService,
      onValue: onFreezeDetected,
    })
    onFreezeDetected.pipe(filter((faulted) => faulted)).subscribe(() => {
      this.logger.info(device.name + ' Detected Freezing')
    })
  }
}
