import { describe, expect, it } from 'vitest'
import { Lock } from '../lock.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
  expectSet,
} from './harness.ts'
import { RingDeviceCategory } from 'ring-client-api'

describe('Lock', () => {
  it('locked state + SET → sendCommand', async () => {
    const device = createRingDevice({
        name: 'Front Lock',
        zid: 'zid-lock',
        deviceType: 'lock',
        categoryId: RingDeviceCategory.Locks,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        locked: 'locked',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Lock,
        device,
        'Front Lock',
        'lock-1',
      ),
      current = getCharacteristic(
        platformAccessory,
        hap.Service.LockMechanism,
        hap.Characteristic.LockCurrentState,
      ),
      target = getCharacteristic(
        platformAccessory,
        hap.Service.LockMechanism,
        hap.Characteristic.LockTargetState,
      )

    expect(current.value).toBe(hap.Characteristic.LockCurrentState.SECURED)

    pushUpdate(device, { locked: 'unlocked' })
    expect(current.value).toBe(hap.Characteristic.LockCurrentState.UNSECURED)

    await expectSet(
      target,
      hap.Characteristic.LockTargetState.SECURED,
      device.sendCommand,
      'lock.lock',
    )
  })
})
