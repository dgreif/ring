import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type { RingDevice } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import type { PlatformAccessory } from 'homebridge'
import { logInfo } from 'ring-client-api/util'

export class FloodFreezeSensor extends BaseDeviceAccessory {
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
        Characteristic: { LeakDetected, OccupancyDetected },
        Service: { LeakSensor, OccupancySensor },
      } = hap,
      leakService = this.getService(LeakSensor, `${device.name} Flood Sensor`),
      freezeService = this.getService(
        OccupancySensor,
        `${device.name} Freeze Sensor`,
      ),
      onFloodDetected = device.onData.pipe(
        map((data) => {
          return data.flood && data.flood.faulted
            ? LeakDetected.LEAK_DETECTED
            : LeakDetected.LEAK_NOT_DETECTED
        }),
        distinctUntilChanged(),
      ),
      onFreezeDetected = device.onData.pipe(
        map((data) => {
          return data.freeze && data.freeze.faulted
            ? OccupancyDetected.OCCUPANCY_DETECTED
            : OccupancyDetected.OCCUPANCY_NOT_DETECTED
        }),
        distinctUntilChanged(),
      )

    this.initSensorService(leakService)
    this.registerObservableCharacteristic({
      characteristicType: LeakDetected,
      serviceType: leakService,
      onValue: onFloodDetected,
    })
    onFloodDetected
      .pipe(filter((faulted) => Boolean(faulted)))
      .subscribe(() => {
        logInfo(device.name + ' Detected Flooding')
      })

    this.initSensorService(freezeService)
    this.registerObservableCharacteristic({
      characteristicType: OccupancyDetected,
      serviceType: freezeService,
      onValue: onFreezeDetected,
    })
    onFreezeDetected
      .pipe(filter((faulted) => Boolean(faulted)))
      .subscribe(() => {
        logInfo(device.name + ' Detected Freezing')
      })
  }
}
