import { describe, expect, it } from 'vitest'
import { Outlet } from '../outlet.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Outlet', () => {
  it('On SET → setInfo', async () => {
    const device = mockRingDevice({
        name: 'Lamp Outlet',
        zid: 'zid-outlet',
        deviceType: RingDeviceType.Switch,
        categoryId: RingDeviceCategory.Outlets,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Outlet,
        device,
        'Lamp Outlet',
        'outlet-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Outlet,
        hap.Characteristic.On,
      )

    await on.setValue(true)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { on: true } },
    })
  })
})
