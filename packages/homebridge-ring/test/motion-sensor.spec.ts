import { describe, expect, it } from 'vitest'
import { MotionSensor } from '../motion-sensor.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('MotionSensor', () => {
  it('faulted → MotionDetected', () => {
    const device = mockRingDevice({
        name: 'Hall Motion',
        zid: 'zid-motion',
        deviceType: RingDeviceType.MotionSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        MotionSensor,
        device,
        'Hall Motion',
        'motion-1',
      ),
      motion = getCharacteristic(
        platformAccessory,
        hap.Service.MotionSensor,
        hap.Characteristic.MotionDetected,
      )

    expect(motion.value).toBe(false)
    device.updateData({ faulted: true })
    expect(motion.value).toBe(true)
  })
})
