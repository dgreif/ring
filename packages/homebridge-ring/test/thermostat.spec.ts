import { describe, expect, it } from 'vitest'
import { Thermostat } from '../thermostat.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Thermostat', () => {
  it('TargetHeatingCoolingState SET → setInfo mode', async () => {
    const device = mockRingDevice({
        name: 'Living Thermostat',
        zid: 'zid-thermo',
        deviceType: RingDeviceType.Thermostat,
        categoryId: RingDeviceCategory.Thermostats,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        mode: 'off',
        setPoint: 21,
        manufacturerName: 'Ring',
      }),
      // Provide a component temperature sensor via onComponentDevices
      tempSensor = mockRingDevice({
        name: 'Thermo Temp',
        zid: 'zid-thermo-temp',
        deviceType: RingDeviceType.TemperatureSensor,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        celsius: 20,
        parentZid: 'zid-thermo',
        manufacturerName: 'Ring',
      })
    device.onComponentDevices.next([tempSensor])

    const { platformAccessory } = initAccessory(
        Thermostat,
        device,
        'Living Thermostat',
        'thermo-1',
      ),
      targetMode = getCharacteristic(
        platformAccessory,
        hap.Service.Thermostat,
        hap.Characteristic.TargetHeatingCoolingState,
      )

    await targetMode.setValue(hap.Characteristic.TargetHeatingCoolingState.HEAT)
    expect(device.setInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        device: expect.objectContaining({
          v1: expect.objectContaining({ mode: 'heat' }),
        }),
      }),
    )
  })
})
