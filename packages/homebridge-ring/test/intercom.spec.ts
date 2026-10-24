import { describe, it } from 'vitest'
import { Intercom } from '../intercom.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingIntercom,
  expectSet,
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

    await expectSet(
      target,
      hap.Characteristic.LockTargetState.UNSECURED,
      device.unlock,
    )
  })
})
