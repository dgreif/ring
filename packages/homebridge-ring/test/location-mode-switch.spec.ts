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
})
