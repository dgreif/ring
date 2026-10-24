import { describe, expect, it } from 'vitest'
import { Thermostat } from '../thermostat.ts'
import {
  createRingDevice,
  expectSet,
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  pushUpdate,
} from './harness.ts'
import type { ThermostatMode } from 'ring-client-api'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

const { CurrentHeatingCoolingState: Current, TargetHeatingCoolingState } =
  hap.Characteristic

function setup(mode: ThermostatMode, setPoint: number, celsius: number) {
  const location = mockLocation(),
    device = createRingDevice(
      {
        name: 'Living Thermostat',
        zid: 'zid-thermo',
        deviceType: RingDeviceType.Thermostat,
        categoryId: RingDeviceCategory.Thermostats,
        mode,
        setPoint,
      },
      location,
    ),
    tempSensor = createRingDevice(
      {
        name: 'Thermo Temp',
        zid: 'zid-thermo-temp',
        deviceType: RingDeviceType.TemperatureSensor,
        celsius,
        parentZid: 'zid-thermo',
      },
      location,
    )

  // RingDevice.onComponentDevices is derived from location.onDevices by parentZid
  location.onDevices.next([device, tempSensor])

  const { platformAccessory } = initAccessory(
      Thermostat,
      device,
      'Living Thermostat',
      'thermo-1',
    ),
    char = (type: any) =>
      getCharacteristic(platformAccessory, hap.Service.Thermostat, type)

  return {
    device,
    tempSensor,
    current: char(hap.Characteristic.CurrentHeatingCoolingState),
    target: char(TargetHeatingCoolingState),
    currentTemperature: char(hap.Characteristic.CurrentTemperature),
  }
}

describe('Thermostat', () => {
  it.each([
    ['off', 20, 15, Current.OFF],
    ['heat', 21, 18, Current.HEAT],
    ['aux', 21, 18, Current.HEAT],
    ['heat', 21, 23, Current.OFF], // already warmer than target
    ['cool', 21, 23, Current.COOL],
    ['cool', 21, 18, Current.OFF], // already cooler than target
    ['heat', 21, 21.05, Current.OFF], // within threshold of target
  ] as const)(
    'mode %s, setPoint %d, temp %d → CurrentHeatingCoolingState %d',
    (mode, setPoint, celsius, expected) => {
      const { current } = setup(mode, setPoint, celsius)
      expect(current.value).toBe(expected)
    },
  )

  it('tracks the component temperature sensor and recomputes heating state', () => {
    const { current, currentTemperature, tempSensor } = setup('heat', 21, 18)

    expect(currentTemperature.value).toBe(18)
    expect(current.value).toBe(Current.HEAT)

    pushUpdate(tempSensor, { celsius: 21.04 })
    expect(currentTemperature.value).toBe(21)
    expect(current.value).toBe(Current.OFF)
  })

  it('maps TargetHeatingCoolingState to Ring modes and disallows AUTO', async () => {
    const { device, target } = setup('off', 21, 20)

    expect(target.props.validValues).toEqual([
      TargetHeatingCoolingState.OFF,
      TargetHeatingCoolingState.HEAT,
      TargetHeatingCoolingState.COOL,
    ])

    await expectSet(target, TargetHeatingCoolingState.HEAT, device.setInfo, {
      device: { v1: { mode: 'heat' } },
    })
    await expectSet(target, TargetHeatingCoolingState.COOL, device.setInfo, {
      device: { v1: { mode: 'cool' } },
    })
    expect(device.location.sendMessage).toHaveBeenLastCalledWith({
      msg: 'DeviceInfoSet',
      datatype: 'DeviceInfoSetType',
      dst: 'asset-1',
      body: [{ zid: 'zid-thermo', device: { v1: { mode: 'cool' } } }],
    })
  })
})
