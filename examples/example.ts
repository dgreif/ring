import 'dotenv/config'
import { RingApi } from '../api'
import { skip } from 'rxjs/operators'

async function example() {
  const { env } = process,
    ringApi = new RingApi({
      // Replace with your ring email/password
      email: env.RING_EMAIL!,
      password: env.RING_PASS!,
      locationIds: [env.RING_LOCATION_ID!] // Remove if you want all locations
    }),
    locations = await ringApi.getLocations()

  console.log(`Found ${locations.length} location(s).`)

  for (let location of locations) {
    location.onConnected.pipe(skip(1)).subscribe(connected => {
      const status = connected ? 'Connected to' : 'Disconnected from'
      console.log(
        `**** ${status} location ${location.locationDetails.name} - ${location.locationId}`
      )
    })
  }

  for (let location of locations) {
    const cameras = location.cameras,
      devices = await location.getDevices()

    console.log(
      `\nLocation ${location.locationDetails.name} has the following ${cameras.length} camera(s):`
    )

    for (let camera of cameras) {
      console.log(`- ${camera.id}: ${camera.name} (${camera.deviceType})`)
    }

    console.log(
      `\nLocation ${location.locationDetails.name} has the following ${devices.length} device(s):`
    )

    for (let device of devices) {
      console.log(`- ${device.zid}: ${device.name} (${device.deviceType})`)
    }
  }
}

example()
