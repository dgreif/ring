import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Fan } from '../fan.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Fan', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('On + RotationSpeed (debounced) → setInfo', async () => {
    const device = mockRingDevice({
        name: 'Ceiling Fan',
        zid: 'zid-fan',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Fans,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        level: 0.5,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Fan,
        device,
        'Ceiling Fan',
        'fan-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.On,
      ),
      speed = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.RotationSpeed,
      )

    expect(speed.value).toBe(50)
    await on.setValue(true)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { on: true } },
    })

    device.setInfo.mockClear()
    await speed.setValue(80)
    expect(device.setInfo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { level: 0.8 } },
    })
  })
})
