import { describe, expect, it } from 'vitest'
import { SmokeAlarm } from '../smoke-alarm.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('SmokeAlarm', () => {
  it('alarmStatus active → smoke detected', () => {
    const device = mockRingDevice({
        name: 'Kitchen Smoke',
        zid: 'zid-smoke',
        deviceType: RingDeviceType.SmokeAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        alarmStatus: 'inactive',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        SmokeAlarm,
        device,
        'Kitchen Smoke',
        'smoke-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      )

    expect(smoke.value).toBe(
      hap.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
    )
    device.updateData({ alarmStatus: 'active' })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)
  })
})
