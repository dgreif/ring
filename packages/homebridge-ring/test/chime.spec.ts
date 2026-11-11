import { afterEach, describe, expect, it, vi } from 'vitest'
import { Chime } from '../chime.ts'
import * as util from 'ring-client-api/util'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingChime,
  expectSet,
} from './harness.ts'

describe('Chime', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

    await expectSet(snooze, true, device.snooze, 24 * 60)

    await expectSet(snooze, false, device.clearSnooze)
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
    await volume.setValue(7)
    await volume.setValue(8)
    await volume.setValue(9)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setVolume).toHaveBeenCalledTimes(1)
    expect(device.setVolume).toHaveBeenCalledWith(9)
  })

  it.each(['reject', 'throw'])(
    'logs a failed volume write (%s) and restores the reported level',
    async (failure) => {
      vi.useFakeTimers()
      const error = new Error('Ring API down'),
        logError = vi.spyOn(util, 'logError').mockImplementation(() => {}),
        device = mockRingChime(),
        { platformAccessory } = initAccessory(
          Chime,
          device,
          'Hall Chime',
          'chime-failure',
        ),
        volume = getCharacteristic(
          platformAccessory,
          hap.Service.Speaker,
          hap.Characteristic.Volume,
        )

      device.setVolume.mockImplementationOnce(() => {
        device.updateData({})
        if (failure === 'throw') {
          throw error
        }
        return Promise.reject(error)
      })

      await volume.setValue(9)
      await vi.advanceTimersByTimeAsync(500)

      expect(logError).toHaveBeenCalledWith(error)
      expect(volume.value).toBe(6)
      expect(await volume.handleGetRequest()).toBe(6)

      device.updateData({ settings: { ...device.data.settings, volume: 9 } })
      expect(volume.value).toBe(9)

      await volume.setValue(4)
      await vi.advanceTimersByTimeAsync(500)
      expect(device.setVolume).toHaveBeenLastCalledWith(4)
      device.updateData({ settings: { ...device.data.settings, volume: 4 } })
      expect(await volume.handleGetRequest()).toBe(4)
    },
  )

  it('does not let an older failed write clear a newer target at the same level', async () => {
    vi.useFakeTimers()
    const error = new Error('Ring API down'),
      logError = vi.spyOn(util, 'logError').mockImplementation(() => {}),
      device = mockRingChime(),
      { platformAccessory } = initAccessory(
        Chime,
        device,
        'Hall Chime',
        'chime-overlapping',
      ),
      volume = getCharacteristic(
        platformAccessory,
        hap.Service.Speaker,
        hap.Characteristic.Volume,
      )
    let rejectFirst!: (error: Error) => void
    device.setVolume.mockReturnValueOnce(
      new Promise<undefined>((_resolve, reject) => {
        rejectFirst = reject
      }),
    )

    await volume.setValue(9)
    await vi.advanceTimersByTimeAsync(500)
    await volume.setValue(9)
    await vi.advanceTimersByTimeAsync(500)
    rejectFirst(error)
    await vi.advanceTimersByTimeAsync(0)

    expect(logError).toHaveBeenCalledWith(error)
    expect(volume.value).toBe(9)
    device.updateData({ settings: { ...device.data.settings, volume: 7 } })
    expect(await volume.handleGetRequest()).toBe(9)
    device.updateData({ settings: { ...device.data.settings, volume: 9 } })
    device.updateData({ settings: { ...device.data.settings, volume: 5 } })
    expect(await volume.handleGetRequest()).toBe(5)
  })
})
