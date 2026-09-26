import { describe, expect, it } from 'vitest'
import { PanicButtons } from '../panic-buttons.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('PanicButtons', () => {
  it('alarmInfo burglar/fire → On; SET triggers location panic APIs', async () => {
    const location = mockLocation(),
      device = mockRingDevice(
        {
          name: 'Security Panel',
          zid: 'zid-panel-panic',
          deviceType: RingDeviceType.SecurityPanel,
          batteryStatus: 'none',
          tamperStatus: 'ok',
          manufacturerName: 'Ring',
          mode: 'none',
        },
        { location },
      ),
      { platformAccessory } = initAccessory(
        PanicButtons,
        device,
        'Panic Buttons',
        'panic-1',
      ),
      burglar = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Burglar',
      ),
      fire = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Fire',
      )

    expect(burglar.value).toBe(false)
    expect(fire.value).toBe(false)

    device.updateData({
      alarmInfo: { state: 'burglar-alarm', faultedDevices: [] },
    })
    expect(burglar.value).toBe(true)

    await fire.setValue(true)
    expect(location.triggerFireAlarm).toHaveBeenCalled()

    await burglar.setValue(false)
    expect(location.setAlarmMode).toHaveBeenCalledWith('none')
  })
})
