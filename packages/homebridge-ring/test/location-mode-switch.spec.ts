import { describe, expect, it, vi } from 'vitest'
import { LocationModeSwitch } from '../location-mode-switch.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockLocationMode,
} from './harness.ts'

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
      {
        SecuritySystemCurrentState: Current,
        SecuritySystemTargetState: Target,
      } = hap.Characteristic

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
})
