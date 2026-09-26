import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Switch } from '../switch.ts'
import { Outlet } from '../outlet.ts'
import { Lock } from '../lock.ts'
import { Valve } from '../valve.ts'
import { Fan } from '../fan.ts'
import { MultiLevelSwitch } from '../multi-level-switch.ts'
import { Beam } from '../beam.ts'
import { SecurityPanel } from '../security-panel.ts'
import { Thermostat } from '../thermostat.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('actuators — Ring ↔ Homebridge', () => {
  it('Switch: onData On ↔ setInfo', async () => {
    const device = mockRingDevice({
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
    device.updateData({ on: true })
    expect(on.value).toBe(true)

    await on.setValue(false)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { on: false } },
    })
  })

  it('Outlet: On SET → setInfo', async () => {
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

  it('Lock: locked state + SET → sendCommand', async () => {
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

  it('Valve: valveState ↔ valve.open/close', async () => {
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

  it('Fan: On + RotationSpeed (debounced) → setInfo', async () => {
    vi.useFakeTimers()
    const device = mockRingDevice({
        name: 'Ceiling Fan',
        zid: 'zid-fan',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Fans,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        level: 0.5,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Fan,
        device,
        'Ceiling Fan',
        'fan-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.On,
      ),
      speed = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.RotationSpeed,
      )

    expect(speed.value).toBe(50)
    await on.setValue(true)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { on: true } },
    })

    device.setInfo.mockClear()
    await speed.setValue(80)
    expect(device.setInfo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { level: 0.8 } },
    })
    vi.useRealTimers()
  })

  it('MultiLevelSwitch: brightness debounce → setInfo level', async () => {
    vi.useFakeTimers()
    const device = mockRingDevice({
        name: 'Dimmer',
        zid: 'zid-dimmer',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: true,
        level: 0.4,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        MultiLevelSwitch,
        device,
        'Dimmer',
        'dimmer-1',
      ),
      brightness = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.Brightness,
      )

    expect(brightness.value).toBe(40)
    await brightness.setValue(25)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { level: 0.25 } },
    })
    vi.useRealTimers()
  })

  it('Beam switch: On → light-mode.set; light group → setLightGroup', async () => {
    const device = mockRingDevice({
        name: 'Path Light',
        zid: 'zid-beam',
        deviceType: RingDeviceType.BeamsSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        on: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Beam,
        device,
        'Path Light',
        'beam-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )

    await on.setValue(true)
    expect(device.sendCommand).toHaveBeenCalledWith('light-mode.set', {
      lightMode: 'on',
      duration: undefined,
    })

    const groupDevice = mockRingDevice({
        name: 'All Lights',
        zid: 'zid-beam-group',
        deviceType: RingDeviceType.BeamsLightGroupSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        groupId: 'group-1',
        manufacturerName: 'Ring',
      }),
      { platformAccessory: groupAcc } = initAccessory(
        Beam,
        groupDevice,
        'All Lights',
        'beam-group-1',
      ),
      groupOn = getCharacteristic(
        groupAcc,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )
    await groupOn.setValue(true)
    expect(groupDevice.location.setLightGroup).toHaveBeenCalledWith(
      'group-1',
      true,
      undefined,
    )
  })

  it('SecurityPanel: mode → SecuritySystem state; SET → arm/disarm', async () => {
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

  it('Thermostat: TargetHeatingCoolingState SET → setInfo mode', async () => {
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

describe('fake timers cleanup', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it('placeholder to ensure real timers', () => {
    expect(emptyConfig).toEqual({})
  })
})
