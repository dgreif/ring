import { describe, expect, it } from 'vitest'
import { FloodFreezeSensor } from '../flood-freeze-sensor.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('FloodFreezeSensor', () => {
  it('flood/freeze faulted map to leak + occupancy', () => {
    const device = mockRingDevice({
        name: 'Basement',
        zid: 'zid-ff',
        deviceType: RingDeviceType.FloodFreezeSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        flood: { faulted: false },
        freeze: { faulted: false },
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        FloodFreezeSensor,
        device,
        'Basement',
        'ff-1',
      ),
      leak = getCharacteristic(
        platformAccessory,
        hap.Service.LeakSensor,
        hap.Characteristic.LeakDetected,
      ),
      freeze = getCharacteristic(
        platformAccessory,
        hap.Service.OccupancySensor,
        hap.Characteristic.OccupancyDetected,
      )

    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED)
    expect(freeze.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    )

    device.updateData({ flood: { faulted: true } })
    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_DETECTED)

    device.updateData({ freeze: { faulted: true } })
    expect(freeze.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED,
    )
  })
})
