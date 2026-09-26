import { describe, expect, it, vi } from 'vitest'
import { Camera } from '../camera.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockRingCamera,
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

    await light.setValue(false)
    expect(device.setLight).toHaveBeenCalledWith(false)

    await siren.setValue(true)
    expect(device.setSiren).toHaveBeenCalledWith(true)
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
})
