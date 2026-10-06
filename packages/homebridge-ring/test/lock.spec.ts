import { describe, expect, it } from 'vitest'
import { Lock } from '../lock.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory } from 'ring-client-api'

describe('Lock', () => {
  it('locked state + SET → sendCommand', async () => {
    const device = mockRingDevice({
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

    device.updateData({ locked: 'unlocked' })
    expect(current.value).toBe(hap.Characteristic.LockCurrentState.UNSECURED)

    await target.setValue(hap.Characteristic.LockTargetState.SECURED)
    expect(device.sendCommand).toHaveBeenCalledWith('lock.lock')
  })
})
