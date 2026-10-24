import { describe, expect, it, vi } from 'vitest'
import { Camera } from '../camera.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockRingCamera,
  expectSet,
} from './harness.ts'

describe('Camera', () => {
  it('light + siren Ring ↔ Homebridge without exercising RTP', async () => {
    const device = mockRingCamera(),
      { platformAccessory } = initAccessory(
        Camera,
        device,
        'Garage Cam',
        'camera-1',
        emptyConfig,
      ),
      light = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      ),
      siren = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Siren',
      )

    expect(light.value).toBe(false)
    expect(siren.value).toBe(false)

    device.updateData({ led_status: 'on' })
    expect(light.value).toBe(true)

    device.updateData({ siren_status: { seconds_remaining: 30 } })
    expect(siren.value).toBe(true)

    await expectSet(light, false, device.setLight, false)

    await expectSet(siren, true, device.setSiren, true)
  })

  it('motion Observable updates MotionDetected', async () => {
    const device = mockRingCamera(),
      { platformAccessory, accessory } = initAccessory(
        Camera,
        device,
        'Garage Cam',
        'camera-2',
      ),
      motion = getCharacteristic(
        platformAccessory,
        hap.Service.MotionSensor,
        hap.Characteristic.MotionDetected,
      )
    expect(motion.value).toBe(false)

    // Avoid snapshot load hanging: patch cameraSource.loadSnapshot
    ;(accessory as any).cameraSource.loadSnapshot = vi.fn(() =>
      Promise.resolve(),
    )

    device.onMotionDetected.next(true)
    await vi.waitFor(() => expect(motion.value).toBe(true))
  })

  it('holds the light target for 30s so stale polls do not flip it back', async () => {
    vi.useFakeTimers()
    try {
      const device = mockRingCamera({ led_status: 'on' }),
        { platformAccessory } = initAccessory(
          Camera,
          device,
          'Garage Cam',
          'camera-3',
        ),
        light = getCharacteristic(
          platformAccessory,
          hap.Service.Lightbulb,
          hap.Characteristic.On,
        )

      await light.setValue(false)
      expect(device.setLight).toHaveBeenCalledWith(false)

      // Polled status still reports the old value before Ring catches up
      device.updateData({ led_status: 'on' })
      expect(light.value).toBe(false)

      await vi.advanceTimersByTimeAsync(29000)
      device.updateData({ led_status: 'on' })
      expect(light.value).toBe(false)

      await vi.advanceTimersByTimeAsync(1000)
      device.updateData({ led_status: 'on' })
      expect(light.value).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('GET returns the cached value and requests a fresh update', async () => {
    const device = mockRingCamera({ led_status: 'on' }),
      { platformAccessory } = initAccessory(
        Camera,
        device,
        'Garage Cam',
        'camera-4',
      ),
      light = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )

    expect(await light.handleGetRequest()).toBe(true)
    expect(device.requestUpdate).toHaveBeenCalledTimes(1)
  })
})
