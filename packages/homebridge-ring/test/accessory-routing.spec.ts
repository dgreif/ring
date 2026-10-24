import { describe, expect, it } from 'vitest'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'
import { getAccessoryClass } from '../ring-platform.ts'
import { Beam } from '../beam.ts'
import { BrightnessOnly } from '../brightness-only.ts'
import { CoAlarm } from '../co-alarm.ts'
import { ContactSensor } from '../contact-sensor.ts'
import { Fan } from '../fan.ts'
import { FloodFreezeSensor } from '../flood-freeze-sensor.ts'
import { FreezeSensor } from '../freeze-sensor.ts'
import { Lock } from '../lock.ts'
import { MotionSensor } from '../motion-sensor.ts'
import { MultiLevelSwitch } from '../multi-level-switch.ts'
import { Outlet } from '../outlet.ts'
import { SecurityPanel } from '../security-panel.ts'
import { SmokeAlarm } from '../smoke-alarm.ts'
import { SmokeCoListener } from '../smoke-co-listener.ts'
import { Switch } from '../switch.ts'
import { TemperatureSensor } from '../temperature-sensor.ts'
import { Thermostat } from '../thermostat.ts'
import { UnknownZWaveSwitchSwitch } from '../unknown-zwave-switch.ts'
import { Valve } from '../valve.ts'
import { WaterSensor } from '../water-sensor.ts'
import type { RingDeviceFixture } from './harness.ts'
import { createRingDevice } from './harness.ts'

function route(fixture: Partial<RingDeviceFixture>) {
  return getAccessoryClass(
    createRingDevice({
      zid: 'zid',
      name: 'Device',
      deviceType: RingDeviceType.ContactSensor,
      ...fixture,
    }),
  )
}

describe('getAccessoryClass', () => {
  it.each([
    [RingDeviceType.ContactSensor, ContactSensor],
    [RingDeviceType.RetrofitZone, ContactSensor],
    [RingDeviceType.TiltSensor, ContactSensor],
    [RingDeviceType.GlassbreakSensor, ContactSensor],
    [RingDeviceType.MotionSensor, MotionSensor],
    [RingDeviceType.FloodFreezeSensor, FloodFreezeSensor],
    [RingDeviceType.FreezeSensor, FreezeSensor],
    [RingDeviceType.SecurityPanel, SecurityPanel],
    [RingDeviceType.BaseStation, BrightnessOnly],
    [RingDeviceType.BaseStationPro, BrightnessOnly],
    [RingDeviceType.Keypad, BrightnessOnly],
    [RingDeviceType.SmokeAlarm, SmokeAlarm],
    [RingDeviceType.CoAlarm, CoAlarm],
    [RingDeviceType.SmokeCoListener, SmokeCoListener],
    [RingDeviceType.KiddeSmokeCoAlarm, SmokeCoListener],
    [RingDeviceType.BeamsMotionSensor, Beam],
    [RingDeviceType.BeamsSwitch, Beam],
    [RingDeviceType.BeamsMultiLevelSwitch, Beam],
    [RingDeviceType.BeamsTransformerSwitch, Beam],
    [RingDeviceType.BeamsLightGroupSwitch, Beam],
    [RingDeviceType.MultiLevelBulb, MultiLevelSwitch],
    [RingDeviceType.TemperatureSensor, TemperatureSensor],
    [RingDeviceType.WaterSensor, WaterSensor],
    [RingDeviceType.Thermostat, Thermostat],
    [RingDeviceType.WaterValve, Valve],
    [RingDeviceType.UnknownZWave, UnknownZWaveSwitchSwitch],
    ['lock', Lock],
    ['lock.zwave', Lock],
  ])('%s → %o', (deviceType, AccessoryClass) => {
    expect(route({ deviceType })).toBe(AccessoryClass)
  })

  it.each([
    RingDeviceType.RingNetAdapter,
    RingDeviceType.ZWaveAdapter,
    RingDeviceType.ZWaveExtender,
    RingDeviceType.SecurityAccessCode,
    RingDeviceType.PanicButton,
    'lockable',
    'something.new',
  ])('%s → hidden', (deviceType) => {
    expect(route({ deviceType })).toBeNull()
  })

  it('uses categoryId to split switches into Outlet / Switch and Fan / MultiLevelSwitch', () => {
    expect(
      route({
        deviceType: RingDeviceType.Switch,
        categoryId: RingDeviceCategory.Outlets,
      }),
    ).toBe(Outlet)
    expect(
      route({
        deviceType: RingDeviceType.Switch,
        categoryId: RingDeviceCategory.Lights,
      }),
    ).toBe(Switch)
    expect(
      route({
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Fans,
      }),
    ).toBe(Fan)
    expect(
      route({
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Lights,
      }),
    ).toBe(MultiLevelSwitch)
  })

  it('routes generic sensors by name', () => {
    expect(
      route({ deviceType: RingDeviceType.Sensor, name: 'Hallway MOTION' }),
    ).toBe(MotionSensor)
    expect(
      route({ deviceType: RingDeviceType.Sensor, name: 'Back Door' }),
    ).toBe(ContactSensor)
  })

  it('hides disabled devices regardless of type', () => {
    expect(
      route({ deviceType: RingDeviceType.ContactSensor, status: 'disabled' }),
    ).toBeNull()
    expect(
      route({ deviceType: RingDeviceType.ContactSensor, status: 'enabled' }),
    ).toBe(ContactSensor)
  })
})
