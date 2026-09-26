import { describe, expect, it } from 'vitest'
import { SmokeCoListener } from '../smoke-co-listener.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('SmokeCoListener', () => {
  it('maps smoke + CO component alarmStatus to HK sensors', () => {
    const device = mockRingDevice({
        name: 'Smoke/CO Listener',
        zid: 'zid-smoke-co',
        deviceType: RingDeviceType.SmokeCoListener,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        manufacturerName: 'Ring',
        smoke: { alarmStatus: 'inactive' },
        co: { alarmStatus: 'inactive' },
      }),
      { platformAccessory } = initAccessory(
        SmokeCoListener,
        device,
        'Smoke/CO Listener',
        'smoke-co-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      ),
      co = getCharacteristic(
        platformAccessory,
        hap.Service.CarbonMonoxideSensor,
        hap.Characteristic.CarbonMonoxideDetected,
      )

    expect(smoke.value).toBe(
      hap.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
    )
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL,
    )

    device.updateData({ smoke: { alarmStatus: 'active' } })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)

    // `co.alarmStatus` takes precedence over components['alarm.co']
    device.updateData({
      smoke: { alarmStatus: 'inactive' },
      co: { alarmStatus: 'active' },
    })
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL,
    )
  })

  it('Kidde uses components alarm.smoke / alarm.co', () => {
    const device = mockRingDevice({
        name: 'Kidde',
        zid: 'zid-kidde',
        deviceType: RingDeviceType.KiddeSmokeCoAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        manufacturerName: 'Kidde',
        components: {
          'alarm.smoke': { alarmStatus: 'inactive' },
          'alarm.co': { alarmStatus: 'inactive' },
        },
      }),
      { platformAccessory } = initAccessory(
        SmokeCoListener,
        device,
        'Kidde',
        'kidde-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      )

    device.updateData({
      components: {
        'alarm.smoke': { alarmStatus: 'active' },
        'alarm.co': { alarmStatus: 'inactive' },
      },
    })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)
  })
})
