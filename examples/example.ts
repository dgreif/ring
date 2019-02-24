import 'dotenv/config'
import { getAlarms } from '../api'
import { skip } from 'rxjs/operators'

async function example() {
  const { env } = process
  const alarms = await getAlarms({
    // Replace with your ring email/password
    email: env.RING_EMAIL!,
    password: env.RING_PASS!,
    locationIds: [env.RING_LOCATION_ID!] // Remove is you want all locations
  })

  console.log(`Found ${alarms.length} alarm(s).`)

  for (let alarm of alarms) {
    alarm.onConnected.pipe(skip(1)).subscribe(connected => {
      const status = connected ? 'Connected to' : 'Disconnected from'
      console.log(`**** ${status} alarm at location ${alarm.locationId}`)
    })
  }

  for (let alarm of alarms) {
    const alarmDevices = await alarm.getDevices()
    console.log(
      `Alarm at location ${alarm.locationId} has the following ${
        alarmDevices.length
      } device(s):`
    )

    for (let device of alarmDevices) {
      console.log(
        `- ${device.zid}: ${device.data.name} (${device.data.deviceType})`
      )
    }
  }
}

example()
