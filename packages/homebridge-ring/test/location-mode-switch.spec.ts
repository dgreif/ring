import { describe, expect, it, vi } from 'vitest'
import { CharacteristicEventTypes } from 'homebridge'
import { LocationModeSwitch } from '../location-mode-switch.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockLocationMode,
} from './harness.ts'

const { SecuritySystemTargetState: Target } = hap.Characteristic

function pendingModeRequest() {
  let reject!: (error: Error) => void
  const promise = new Promise<{ mode: string }>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

function setup() {
  const location = mockLocationMode('disarmed'),
    { platformAccessory } = initAccessory(
      LocationModeSwitch as any,
      location,
      'Home Mode',
      'mode-recovery',
    ),
    target = getCharacteristic(
      platformAccessory,
      hap.Service.SecuritySystem,
      hap.Characteristic.SecuritySystemTargetState,
    )

  return { location, target }
}

describe('LocationModeSwitch', () => {
  it('onLocationMode → SecuritySystem state; SET → setLocationMode', async () => {
    vi.useRealTimers()
    const location = mockLocationMode('disarmed'),
      { platformAccessory } = initAccessory(
        LocationModeSwitch as any,
        location,
        'Home Mode',
        'mode-1',
      ),
      current = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemCurrentState,
      ),
      target = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemTargetState,
      )

    expect(current.value).toBe(
      hap.Characteristic.SecuritySystemCurrentState.DISARMED,
    )

    location.onLocationMode.next('away')
    expect(current.value).toBe(
      hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM,
    )

    await target.setValue(hap.Characteristic.SecuritySystemTargetState.STAY_ARM)
    // SET handler is async after callback(); wait for the location call
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('home'),
    )

    location.setLocationMode.mockClear()
    await target.setValue(hap.Characteristic.SecuritySystemTargetState.DISARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('disarmed'),
    )
  })

  it('keeps the requested target until Ring reports the matching mode', async () => {
    const location = mockLocationMode('disarmed'),
      { platformAccessory } = initAccessory(
        LocationModeSwitch as any,
        location,
        'Home Mode',
        'mode-2',
      ),
      current = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemCurrentState,
      ),
      target = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemTargetState,
      ),
      { SecuritySystemCurrentState: Current } = hap.Characteristic

    // Ring acknowledges the request but the mode change lands later
    location.setLocationMode.mockImplementation((mode: string) =>
      Promise.resolve({ mode }),
    )

    target.setValue(Target.AWAY_ARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('away'),
    )

    // An unrelated mode change updates current state but not the pending target
    location.onLocationMode.next('home')
    expect(current.value).toBe(Current.STAY_ARM)
    expect(target.value).toBe(Target.AWAY_ARM)

    location.onLocationMode.next('away')
    expect(current.value).toBe(Current.AWAY_ARM)

    // With no pending target, mode changes drive the target again
    location.onLocationMode.next('disarmed')
    expect(target.value).toBe(Target.DISARM)
    expect(target.props.validValues).not.toContain(Target.NIGHT_ARM)
  })

  it('keeps a pending STAY_ARM target even though its value is zero', async () => {
    const { location, target } = setup()
    location.setLocationMode.mockResolvedValue({ mode: 'home' })

    target.setValue(Target.STAY_ARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('home'),
    )

    location.onLocationMode.next('away')
    expect(target.value).toBe(Target.STAY_ARM)
    expect(await target.handleGetRequest()).toBe(Target.STAY_ARM)

    location.onLocationMode.next('home')
    location.onLocationMode.next('disarmed')
    expect(target.value).toBe(Target.DISARM)
  })

  it('reverts a failed request to the latest reported mode and clears the pending target', async () => {
    const { location, target } = setup(),
      request = pendingModeRequest()
    location.setLocationMode.mockReturnValueOnce(request.promise)

    target.setValue(Target.AWAY_ARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('away'),
    )
    location.onLocationMode.next('home')
    expect(target.value).toBe(Target.AWAY_ARM)

    request.reject(new Error('Ring API down'))
    await vi.waitFor(() => expect(target.value).toBe(Target.STAY_ARM))
    expect(await target.handleGetRequest()).toBe(Target.STAY_ARM)

    location.onLocationMode.next('disarmed')
    expect(target.value).toBe(Target.DISARM)
  })

  it('does not let an older failed request clear a newer request for the same target', async () => {
    const { location, target } = setup(),
      older = pendingModeRequest()
    location.setLocationMode
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ mode: 'away' })

    target.setValue(Target.AWAY_ARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledTimes(1),
    )
    target.setValue(Target.AWAY_ARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledTimes(2),
    )

    older.reject(new Error('Old request failed'))
    await older.promise.catch(() => undefined)
    await target.handleGetRequest()
    location.onLocationMode.next('home')
    expect(target.value).toBe(Target.AWAY_ARM)
    expect(await target.handleGetRequest()).toBe(Target.AWAY_ARM)
  })

  it('does not let delayed NIGHT_ARM normalization overwrite failure recovery', async () => {
    vi.useFakeTimers()
    try {
      const { location, target } = setup()
      location.setLocationMode.mockRejectedValueOnce(new Error('Ring API down'))

      // NIGHT_ARM is excluded from validValues, but the handler supports older clients.
      target.emit(CharacteristicEventTypes.SET, Target.NIGHT_ARM, vi.fn())
      await vi.advanceTimersByTimeAsync(0)
      expect(location.setLocationMode).toHaveBeenCalledWith('home')
      expect(await target.handleGetRequest()).toBe(Target.DISARM)

      await vi.advanceTimersByTimeAsync(100)
      expect(target.value).toBe(Target.DISARM)
    } finally {
      vi.useRealTimers()
    }
  })
})
