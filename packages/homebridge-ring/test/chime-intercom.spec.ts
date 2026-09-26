import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chime } from '../chime.ts'
import { Intercom } from '../intercom.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingChime,
  mockRingIntercom,
} from './harness.ts'

describe('chime / intercom — Ring ↔ Homebridge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('Chime: snooze On from do_not_disturb; SET calls snooze/clearSnooze', async () => {
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

  it('Chime: volume SET (debounced) → setVolume', async () => {
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

  it('Intercom: LockTargetState unlock → device.unlock()', async () => {
    const device = mockRingIntercom(),
      { platformAccessory } = initAccessory(
        Intercom,
        device,
        'Lobby Intercom',
        'intercom-1',
      ),
      target = getCharacteristic(
        platformAccessory,
        hap.Service.LockMechanism,
        hap.Characteristic.LockTargetState,
      )

    await target.setValue(hap.Characteristic.LockTargetState.UNSECURED)
    expect(device.unlock).toHaveBeenCalled()
  })
})
