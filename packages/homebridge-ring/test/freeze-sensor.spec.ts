import { describe, expect, it } from 'vitest'
import { FreezeSensor } from '../freeze-sensor.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('FreezeSensor', () => {
  it('faulted → OccupancyDetected', () => {
    const freezeDevice = createRingDevice({
        name: 'Freeze',
        zid: 'zid-freeze',
        deviceType: RingDeviceType.FreezeSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory: freezeAcc } = initAccessory(
        FreezeSensor,
        freezeDevice,
        'Freeze',
        'freeze-1',
      ),
      freezeChar = getCharacteristic(
        freezeAcc,
        hap.Service.OccupancySensor,
        hap.Characteristic.OccupancyDetected,
      )
    pushUpdate(freezeDevice, { faulted: true })
    expect(freezeChar.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED,
    )
  })
})
