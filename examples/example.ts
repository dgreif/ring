import 'dotenv/config'
import { RingApi } from '../api'
import { RingDeviceType } from '../api/ring-types'
import { skip } from 'rxjs/operators'
import { readFile, writeFile } from 'fs'
import { promisify } from 'util'

async function example() {
  const { env } = process,
    ringApi = new RingApi({
      // Replace with your refresh token
      refreshToken: env.RING_REFRESH_TOKEN!,
      // Listen for dings and motion events
      cameraDingsPollingSeconds: 2,
    }),
    locations = await ringApi.getLocations()

  ringApi.onRefreshTokenUpdated.subscribe(
    async ({ newRefreshToken, oldRefreshToken }) => {
      console.log('Refresh Token Updated: ', newRefreshToken)

      // If you are implementing a project that use `ring-client-api`, you should subscribe to onRefreshTokenUpdated and update your config each time it fires an event
      // Here is an example using a .env file for configuration
      if (!oldRefreshToken) {
        return
      }

      const currentConfig = await promisify(readFile)('.env'),
        updatedConfig = currentConfig
          .toString()
          .replace(oldRefreshToken, newRefreshToken)

      await promisify(writeFile)('.env', updatedConfig)
    }
  )

  for (const location of locations) {
    location.onConnected.pipe(skip(1)).subscribe((connected) => {
      const status = connected ? 'Connected to' : 'Disconnected from'
      console.log(`**** ${status} location ${location.name} - ${location.id}`)
    })
  }

  for (const location of locations) {
    const devices = await location.getDevices()

    console.log(
      `\nLocation ${location.name} has the following ${devices.length} device(s):`
    )

    const thermostats = devices.find(
      ({ data }) => data.deviceType === RingDeviceType.Thermostat
    )
    console.log(JSON.stringify(thermostats))
  }
}

example()
