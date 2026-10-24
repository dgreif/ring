import { describe, expect, it } from 'vitest'
import { Switch } from '../switch.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  pushUpdate,
  expectSet,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Switch', () => {
  it('onData On ↔ setInfo', async () => {
    const device = createRingDevice({
        name: 'Plug Switch',
        zid: 'zid-switch',
        deviceType: RingDeviceType.Switch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Switch,
        device,
        'Plug Switch',
        'switch-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
      )

    expect(on.value).toBe(false)
    pushUpdate(device, { on: true })
    expect(on.value).toBe(true)

    await expectSet(on, false, device.setInfo, {
      device: { v1: { on: false } },
    })
  })
})
