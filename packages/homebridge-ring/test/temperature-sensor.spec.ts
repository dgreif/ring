import { describe, expect, it } from 'vitest'
import { TemperatureSensor } from '../temperature-sensor.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('TemperatureSensor', () => {
  it('celsius → CurrentTemperature', () => {
    const tempDevice = mockRingDevice({
        name: 'Temp',
        zid: 'zid-temp',
        deviceType: RingDeviceType.TemperatureSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        celsius: 20,
        manufacturerName: 'Ring',
      }),
      { platformAccessory: tempAcc } = initAccessory(
        TemperatureSensor,
        tempDevice,
        'Temp',
        'temp-1',
        emptyConfig,
      ),
      temp = getCharacteristic(
        tempAcc,
        hap.Service.TemperatureSensor,
        hap.Characteristic.CurrentTemperature,
      )
    expect(temp.value).toBe(20)
    tempDevice.updateData({ celsius: 22.5 })
    expect(temp.value).toBe(22.5)
  })
})
