/* eslint-disable no-console */
import { RingApi } from './api.ts'
import { acquireRefreshToken } from './refresh-token.ts'
import { mapAsync } from './util.ts'

const sensitiveFields = [
    'id',
    'device_id',
    'latitude',
    'longitude',
    'address',
    'address1',
    'address2',
    'email',
    'time_zone',
    'timezone',
    'location_id',
    'serialnumber',
    'serial_number',
    'catalogid',
    'adapterzid',
    'fingerprint',
    'owner',
    'ssid',
    'wifi_name',
    'ap_address',
    'mac_address',
    'macaddress',
    'codes',
    'groupid',
    'group',
    'groupmembers',
    'first_name',
    'last_name',
    'phone',
    'phone_number',
    'third_party_dsn',
    'amzn_dsn',
    'refresh_token',
    'access_token',
    'password',
    'token',
    'cookie',
    'city',
    'zip_code',
    'cross_street',
  ],
  sensitiveFieldSet = new Set(sensitiveFields),
  uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const redactedUuid = '[uuid]'

function isUuid(value: string) {
  return value.length === 36 && uuidPattern.test(value)
}

function isSensitiveKey(key: string) {
  const lower = key.toLowerCase()
  return (
    sensitiveFieldSet.has(lower) ||
    lower.endsWith('_id') ||
    // camelCase ids such as roomId / doorbotId (but not zid — keep key, redact value)
    (key.endsWith('Id') && key !== 'Id')
  )
}

export function stripSensitiveFields(input: unknown) {
  if (input === null || typeof input !== 'object') {
    return
  }

  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i++) {
      const value = input[i]
      if (typeof value === 'string' && isUuid(value)) {
        input[i] = redactedUuid
      } else {
        stripSensitiveFields(value)
      }
    }
    return
  }

  const record = input as Record<string, unknown>
  let uuidKeyIndex = 0

  // Snapshot keys so renames during iteration cannot re-introduce originals.
  for (const key of Object.keys(record)) {
    if (isSensitiveKey(key)) {
      delete record[key]
      continue
    }

    let data = record[key]

    if (isUuid(key)) {
      delete record[key]
      if (typeof data === 'string' && isUuid(data)) {
        data = redactedUuid
      }
      // Unique placeholder per key so sibling uuid keys do not clobber each other.
      record[`${redactedUuid}:${uuidKeyIndex++}`] = data
      stripSensitiveFields(data)
      continue
    }

    if (typeof data === 'string' && isUuid(data)) {
      record[key] = redactedUuid
      continue
    }

    stripSensitiveFields(data)
  }
}

export async function logDeviceData() {
  console.log(
    'This CLI will log data from you Ring Account to help debug issues and discovering new device types.',
  )
  console.log(
    'The logged data is anonymized and should not compromise your account in any way.',
  )

  const refreshToken = await acquireRefreshToken(),
    ringApi = new RingApi({ refreshToken })

  console.log('Successfully logged in.  Fetching devices...')
  const locations = await ringApi.getLocations(),
    amazonKeyLocks = await ringApi.fetchAmazonKeyLocks(),
    locationsWithDevices = await mapAsync(locations, async (location) => {
      const devices = await location.getDevices()
      return {
        name: location.name,
        cameras: location.cameras.map((camera) => camera.data),
        chimes: location.chimes.map((chime) => chime.data),
        intercoms: location.intercoms.map((intercom) => intercom.data),
        devices: devices.map((device) => device.data),
      }
    }),
    // Clone so redaction does not mutate live RingApi device objects.
    results = structuredClone({
      locations: locationsWithDevices,
      amazonKeyLocks,
    })

  stripSensitiveFields(results)

  console.log('\nPlease copy and paste everything AFTER THIS LINE:\n\n')
  console.log(JSON.stringify(results))
  process.exit(0)
}
