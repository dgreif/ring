import { describe, expect, it } from 'vitest'
import { ContactSensor } from '../contact-sensor.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceType } from 'ring-client-api'

describe('ContactSensor', () => {
  it.each([
    ['ContactSensor', RingDeviceType.ContactSensor],
    ['TiltSensor', RingDeviceType.TiltSensor],
    ['GlassbreakSensor', RingDeviceType.GlassbreakSensor],
    ['RetrofitZone', RingDeviceType.RetrofitZone],
  ] as const)('%s: faulted flips ContactSensorState', (_label, deviceType) => {
    const device = mockRingDevice({
        name: 'Sensor',
        zid: `zid-${deviceType}`,
        deviceType,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        faulted: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        ContactSensor,
        device,
        'Sensor',
        `contact-${deviceType}`,
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
})
