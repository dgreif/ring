import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chime } from '../chime.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingChime,
} from './harness.ts'

describe('Chime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('snooze On from do_not_disturb; SET calls snooze/clearSnooze', async () => {
    const device = mockRingChime(),
      { platformAccessory } = initAccessory(
        Chime,
        device,
        'Hall Chime',
        'chime-1',
      ),
      snooze = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'snooze',
      )

    expect(snooze.value).toBe(false)
    device.updateData({ do_not_disturb: { seconds_left: 100 } })
    expect(snooze.value).toBe(true)

    await snooze.setValue(true)
    expect(device.snooze).toHaveBeenCalledWith(24 * 60)

    await snooze.setValue(false)
    expect(device.clearSnooze).toHaveBeenCalled()
  })

  it('volume SET (debounced) → setVolume', async () => {
    vi.useFakeTimers()
    const device = mockRingChime(),
      { platformAccessory } = initAccessory(
        Chime,
        device,
        'Hall Chime',
        'chime-2',
      ),
      volume = getCharacteristic(
        platformAccessory,
        hap.Service.Speaker,
        hap.Characteristic.Volume,
      )

    expect(volume.value).toBe(6)
    await volume.setValue(9)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setVolume).toHaveBeenCalledWith(9)
  })
})
