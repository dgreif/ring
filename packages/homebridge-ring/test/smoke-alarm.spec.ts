import { describe, expect, it } from 'vitest'
import { SmokeAlarm } from '../smoke-alarm.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('SmokeAlarm', () => {
  it('alarmStatus active → smoke detected', () => {
    const device = createRingDevice({
        name: 'Kitchen Smoke',
        zid: 'zid-smoke',
        deviceType: RingDeviceType.SmokeAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
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
    pushUpdate(device, { alarmStatus: 'active' })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)
  })
})
