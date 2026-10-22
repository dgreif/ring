import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrightnessOnly } from '../brightness-only.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('BrightnessOnly', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('brightness from Ring → Lightbulb; SET debounces to setInfo', async () => {
    const device = mockRingDevice({
        name: 'Keypad',
        zid: 'zid-keypad',
        deviceType: RingDeviceType.Keypad,
        categoryId: RingDeviceCategory.Keypads,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        brightness: 0.4,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        BrightnessOnly,
        device,
        'Keypad',
        'keypad-1',
      ),
      brightness = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.Brightness,
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )

    expect(brightness.value).toBe(40)
    expect(on.value).toBe(true)

    await brightness.setValue(70)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { brightness: 0.7 } },
    })
  })
})
