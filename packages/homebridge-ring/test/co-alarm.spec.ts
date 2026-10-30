import { describe, expect, it } from 'vitest'
import { CoAlarm } from '../co-alarm.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('CoAlarm', () => {
  it('alarmStatus active → CO abnormal', () => {
    const device = createRingDevice({
        name: 'Hall CO',
        zid: 'zid-co',
        deviceType: RingDeviceType.CoAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(CoAlarm, device, 'Hall CO', 'co-1'),
      co = getCharacteristic(
        platformAccessory,
        hap.Service.CarbonMonoxideSensor,
        hap.Characteristic.CarbonMonoxideDetected,
      )

    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL,
    )
    pushUpdate(device, { alarmStatus: 'active' })
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL,
    )
  })
})
