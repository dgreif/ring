import { describe, expect, it } from 'vitest'
import { Valve } from '../valve.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Valve', () => {
  it('valveState ↔ valve.open/close', async () => {
    const device = mockRingDevice({
        name: 'Main Valve',
        zid: 'zid-valve',
        deviceType: RingDeviceType.WaterValve,
        categoryId: RingDeviceCategory.WaterValves,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        valveState: 'closed',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Valve,
        device,
        'Main Valve',
        'valve-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
      )

    expect(on.value).toBe(false)
    device.updateData({ valveState: 'open' })
    expect(on.value).toBe(true)

    await on.setValue(false)
    expect(device.sendCommand).toHaveBeenCalledWith('valve.close')
  })
})
