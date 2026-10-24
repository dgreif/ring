import { describe, expect, it } from 'vitest'
import { WaterSensor } from '../water-sensor.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('WaterSensor', () => {
  it('faulted → LeakDetected', () => {
    const waterDevice = createRingDevice({
        name: 'Water',
        zid: 'zid-water',
        deviceType: RingDeviceType.WaterSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory: waterAcc } = initAccessory(
        WaterSensor,
        waterDevice,
        'Water',
        'water-1',
      ),
      leak = getCharacteristic(
        waterAcc,
        hap.Service.LeakSensor,
        hap.Characteristic.LeakDetected,
      )
    pushUpdate(waterDevice, { faulted: true })
    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_DETECTED)
  })
})
