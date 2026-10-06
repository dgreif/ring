import { describe, expect, it } from 'vitest'
import { UnknownZWaveSwitchSwitch } from '../unknown-zwave-switch.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('UnknownZWaveSwitch', () => {
  it('basicValue → On; SET → setInfo basicValue 255/0', async () => {
    const device = mockRingDevice({
        name: 'Mystery ZWave',
        zid: 'zid-zwave',
        deviceType: RingDeviceType.UnknownZWave,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        basicValue: 0,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        UnknownZWaveSwitchSwitch,
        device,
        'Mystery ZWave',
        'zwave-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
      )

    expect(on.value).toBe(false)
    device.updateData({ basicValue: 255 })
    expect(on.value).toBe(true)

    await on.setValue(false)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { basicValue: 0 } },
    })
  })
})
