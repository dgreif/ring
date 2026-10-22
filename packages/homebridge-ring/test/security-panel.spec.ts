import { describe, expect, it } from 'vitest'
import { SecurityPanel } from '../security-panel.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('SecurityPanel', () => {
  it('mode → SecuritySystem state; SET → arm/disarm', async () => {
    const location = mockLocation(),
      device = mockRingDevice(
        {
          name: 'Security Panel',
          zid: 'zid-panel',
          deviceType: RingDeviceType.SecurityPanel,
          categoryId: RingDeviceCategory.Security,
          batteryStatus: 'none',
          tamperStatus: 'ok',
          mode: 'none',
          manufacturerName: 'Ring',
        },
        { location },
      ),
      { platformAccessory } = initAccessory(
        SecurityPanel,
        device,
        'Security Panel',
        'panel-1',
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

    device.updateData({ mode: 'all' })
    expect(current.value).toBe(
      hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM,
    )

    await target.setValue(hap.Characteristic.SecuritySystemTargetState.STAY_ARM)
    expect(location.armHome).toHaveBeenCalled()

    await target.setValue(hap.Characteristic.SecuritySystemTargetState.DISARM)
    expect(location.disarm).toHaveBeenCalled()
  })
})
