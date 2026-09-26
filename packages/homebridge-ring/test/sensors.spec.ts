import { describe, expect, it } from 'vitest'
import { ContactSensor } from '../contact-sensor.ts'
import { MotionSensor } from '../motion-sensor.ts'
import { SmokeAlarm } from '../smoke-alarm.ts'
import { CoAlarm } from '../co-alarm.ts'
import { FloodFreezeSensor } from '../flood-freeze-sensor.ts'
import { FreezeSensor } from '../freeze-sensor.ts'
import { WaterSensor } from '../water-sensor.ts'
import { TemperatureSensor } from '../temperature-sensor.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('sensors — Ring → Homebridge', () => {
  it('ContactSensor: faulted flips ContactSensorState', () => {
    const device = mockRingDevice({
        name: 'Front Door',
        zid: 'zid-contact',
        deviceType: RingDeviceType.ContactSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        ContactSensor,
        device,
        'Front Door',
        'contact-1',
      ),
      contact = getCharacteristic(
        platformAccessory,
        hap.Service.ContactSensor,
        hap.Characteristic.ContactSensorState,
      )

    expect(contact.value).toBe(
      hap.Characteristic.ContactSensorState.CONTACT_DETECTED,
    )

    device.updateData({ faulted: true })
    expect(contact.value).toBe(
      hap.Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    )
  })

  it('MotionSensor: faulted → MotionDetected', () => {
    const device = mockRingDevice({
        name: 'Hall Motion',
        zid: 'zid-motion',
        deviceType: RingDeviceType.MotionSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        MotionSensor,
        device,
        'Hall Motion',
        'motion-1',
      ),
      motion = getCharacteristic(
        platformAccessory,
        hap.Service.MotionSensor,
        hap.Characteristic.MotionDetected,
      )

    expect(motion.value).toBe(false)
    device.updateData({ faulted: true })
    expect(motion.value).toBe(true)
  })

  it('SmokeAlarm: alarmStatus active → smoke detected', () => {
    const device = mockRingDevice({
        name: 'Kitchen Smoke',
        zid: 'zid-smoke',
        deviceType: RingDeviceType.SmokeAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        alarmStatus: 'inactive',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        SmokeAlarm,
        device,
        'Kitchen Smoke',
        'smoke-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      )

    expect(smoke.value).toBe(
      hap.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
    )
    device.updateData({ alarmStatus: 'active' })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)
  })

  it('CoAlarm: alarmStatus active → CO abnormal', () => {
    const device = mockRingDevice({
        name: 'Hall CO',
        zid: 'zid-co',
        deviceType: RingDeviceType.CoAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        alarmStatus: 'inactive',
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(CoAlarm, device, 'Hall CO', 'co-1'),
      co = getCharacteristic(
        platformAccessory,
        hap.Service.CarbonMonoxideSensor,
        hap.Characteristic.CarbonMonoxideDetected,
      )

    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL,
    )
    device.updateData({ alarmStatus: 'active' })
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL,
    )
  })

  it('FloodFreezeSensor: flood/freeze faulted map to leak + occupancy', () => {
    const device = mockRingDevice({
        name: 'Basement',
        zid: 'zid-ff',
        deviceType: RingDeviceType.FloodFreezeSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        flood: { faulted: false },
        freeze: { faulted: false },
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        FloodFreezeSensor,
        device,
        'Basement',
        'ff-1',
      ),
      leak = getCharacteristic(
        platformAccessory,
        hap.Service.LeakSensor,
        hap.Characteristic.LeakDetected,
      ),
      freeze = getCharacteristic(
        platformAccessory,
        hap.Service.OccupancySensor,
        hap.Characteristic.OccupancyDetected,
      )

    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_NOT_DETECTED)
    expect(freeze.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    )

    device.updateData({ flood: { faulted: true } })
    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_DETECTED)

    device.updateData({ freeze: { faulted: true } })
    expect(freeze.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED,
    )
  })

  it('FreezeSensor / WaterSensor / TemperatureSensor update from onData', () => {
    const freezeDevice = mockRingDevice({
        name: 'Freeze',
        zid: 'zid-freeze',
        deviceType: RingDeviceType.FreezeSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory: freezeAcc } = initAccessory(
        FreezeSensor,
        freezeDevice,
        'Freeze',
        'freeze-1',
      ),
      freezeChar = getCharacteristic(
        freezeAcc,
        hap.Service.OccupancySensor,
        hap.Characteristic.OccupancyDetected,
      )
    freezeDevice.updateData({ faulted: true })
    expect(freezeChar.value).toBe(
      hap.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED,
    )

    const waterDevice = mockRingDevice({
        name: 'Water',
        zid: 'zid-water',
        deviceType: RingDeviceType.WaterSensor,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory: waterAcc } = initAccessory(
        WaterSensor,
        waterDevice,
        'Water',
        'water-1',
      ),
      leak = getCharacteristic(
        waterAcc,
        hap.Service.LeakSensor,
        hap.Characteristic.LeakDetected,
      )
    waterDevice.updateData({ faulted: true })
    expect(leak.value).toBe(hap.Characteristic.LeakDetected.LEAK_DETECTED)

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
