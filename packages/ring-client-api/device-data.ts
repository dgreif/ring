/* eslint-disable no-console */
import { RingApi } from './api'
import { acquireRefreshToken } from './refresh-token'
import { mapAsync } from './util'

const sensitiveFields = [
  'id',
  'device_id',
  'latitude',
  'longitude',
  'address',
  'email',
  'time_zone',
  'location_id',
  'serialNumber',
  'catalogId',
  'adapterZid',
  'fingerprint',
  'owner',
  'ssid',
  'ap_address',
  'codes',
  'groupId',
  'group',
  'groupMembers',
]

function stripSensitiveFields(input: any) {
  if (typeof input === 'object') {
    if (Array.isArray(input)) {
      input.forEach((value) => stripSensitiveFields(value))
      return
    }

    for (const key in input) {
      if (sensitiveFields.includes(key) || key.endsWith('_id')) {
        delete input[key]
      } else {
        const data = input[key]

        if (key.length === 36) {
          input[key.slice(0, 13) + '-uuid'] = data
          delete input[key]
        }

        if (typeof data === 'string' && data.length === 36) {
          input[key] = data.slice(0, 13) + '-uuid'
        }

        stripSensitiveFields(data)
      }
    }
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
    results = {
      locations: locationsWithDevices,
      amazonKeyLocks,
    }

  stripSensitiveFields(results)

  console.log('\nPlease copy and paste everything AFTER THIS LINE:\n\n')
  console.log(JSON.stringify(results))
  process.exit(0)
}
