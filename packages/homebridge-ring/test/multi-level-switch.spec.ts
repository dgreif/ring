import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MultiLevelSwitch } from '../multi-level-switch.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('MultiLevelSwitch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('brightness debounce → setInfo level', async () => {
    const device = mockRingDevice({
        name: 'Dimmer',
        zid: 'zid-dimmer',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: true,
        level: 0.4,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        MultiLevelSwitch,
        device,
        'Dimmer',
        'dimmer-1',
      ),
      brightness = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.Brightness,
      )

    expect(brightness.value).toBe(40)
    await brightness.setValue(25)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { level: 0.25 } },
    })
  })
})
