import 'dotenv/config'
import { getLocations } from '../api'
import { skip } from 'rxjs/operators'

async function example() {
  const { env } = process
  const locations = await getLocations({
    // Replace with your ring email/password
    email: env.RING_EMAIL!,
    password: env.RING_PASS!,
    locationIds: [env.RING_LOCATION_ID!] // Remove if you want all locations
  })

  console.log(`Found ${locations.length} location(s).`)

  for (let location of locations) {
    location.onConnected.pipe(skip(1)).subscribe(connected => {
      const status = connected ? 'Connected to' : 'Disconnected from'
      console.log(
        `**** ${status} location ${location.locationDetails.name} - ${
          location.locationId
        }`
      )
    })
  }

  for (let location of locations) {
    const devices = await location.getDevices()
    console.log(
      `Location ${location.locationId} has the following ${
        devices.length
      } device(s):`
    )

    for (let device of devices) {
      console.log(
        `- ${device.zid}: ${device.data.name} (${device.data.deviceType})`
      )
    }
  }
}

example()
