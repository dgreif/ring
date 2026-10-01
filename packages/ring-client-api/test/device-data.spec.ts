import { describe, expect, it } from 'vitest'
import { redactedUuid, stripSensitiveFields } from '../device-data.ts'

describe('stripSensitiveFields', () => {
  it('removes known sensitive fields and *_id / *Id keys', () => {
    const input = {
      id: 123,
      device_id: 'aa:bb:cc:dd:ee:ff',
      location_id: 'loc',
      hardware_id: 'hw',
      roomId: 4,
      email: 'user@example.com',
      owner: { email: 'user@example.com', first_name: 'Ada' },
      latitude: 1,
      longitude: 2,
      address: '1 Main St',
      serialNumber: 'SN-1',
      kind: 'doorbell',
    }

    stripSensitiveFields(input)

    expect(input).toEqual({ kind: 'doorbell' })
  })

  it('fully redacts uuid values instead of keeping a prefix', () => {
    const uuid = 'ffffffff-1111-2222-3333-444444444444',
      input = { zid: uuid, parentZid: uuid }

    stripSensitiveFields(input)

    expect(input).toEqual({
      zid: redactedUuid,
      parentZid: redactedUuid,
    })
  })

  it('redacts uuid keys without re-introducing the original key or value', () => {
    const uuidKey = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      uuidVal = 'ffffffff-1111-2222-3333-444444444444',
      input: Record<string, unknown> = {
        [uuidKey]: uuidVal,
        other: true,
      }

    stripSensitiveFields(input)

    expect(input).toEqual({
      [`${redactedUuid}:0`]: redactedUuid,
      other: true,
    })
    expect(JSON.stringify(input)).not.toContain('aaaaaaaa')
    expect(JSON.stringify(input)).not.toContain('ffffffff-1111-2222')
  })

  it('strips wifi, mac, serial, phone, dsn, and token fields that previously leaked', () => {
    const input = {
      wifi_name: 'MyHomeNet',
      ssid: 'MyHomeNet',
      mac_address: 'aa:bb:cc:dd:ee:ff',
      serial_number: 'SN-2',
      SerialNumber: 'SN-3',
      third_party_dsn: 'DSN123',
      metadata: {
        third_party_properties: {
          amzn_dsn: 'AMZ999',
          uuid: 'ffffffff-1111-2222-3333-444444444444',
        },
      },
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+15551212',
      phone_number: '+15551212',
      refresh_token: 'rt',
      access_token: 'at',
      password: 'secret',
      token: 't',
      cookie: 'c',
      description: 'Front Door',
    }

    stripSensitiveFields(input)

    expect(input).toEqual({
      metadata: {
        third_party_properties: {
          uuid: redactedUuid,
        },
      },
      description: 'Front Door',
    })
  })

  it('strips loose address parts when not nested under address', () => {
    const input = {
      address1: '1 Main',
      city: 'Springfield',
      zip_code: '12345',
      cross_street: 'Oak',
      geo_coordinates: { latitude: '1', longitude: '2' },
      timezone: 'America/New_York',
    }

    stripSensitiveFields(input)

    expect(input).toEqual({
      geo_coordinates: {},
    })
  })

  it('redacts uuid strings inside arrays', () => {
    const uuid = 'ffffffff-1111-2222-3333-444444444444',
      input = {
        alarmInfo: { faultedDevices: [uuid, 'not-a-uuid'] },
      }

    stripSensitiveFields(input)

    expect(input).toEqual({
      alarmInfo: { faultedDevices: [redactedUuid, 'not-a-uuid'] },
    })
  })

  it('does not throw on null nested values', () => {
    const input = { kind: 'x', nested: null }
    stripSensitiveFields(input)
    expect(input).toEqual({ kind: 'x', nested: null })
  })
})
