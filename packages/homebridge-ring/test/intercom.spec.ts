import { describe, expect, it } from 'vitest'
import { Intercom } from '../intercom.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingIntercom,
} from './harness.ts'

describe('Intercom', () => {
  it('LockTargetState unlock → device.unlock()', async () => {
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
