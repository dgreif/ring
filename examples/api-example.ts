import 'dotenv/config'
import { RingApi } from '../api'

async function example() {
  const { env } = process,
    ringApi = new RingApi({
      // Replace with your refresh token
      refreshToken: env.RING_REFRESH_TOKEN!,
    }),
    locations = await ringApi.getLocations(),
    location = locations[0],
    cameras = await ringApi.getCameras(),
    camera = cameras[0]

  // Locations API
  location.onConnected.subscribe((connected) => {
    const state = connected ? 'Connected' : 'Connecting'
    console.log(`${state} to location ${location.name} - ${location.id}`)
  })

  const locationCameraEvents = await location.getCameraEvents({
      // same params as camera.getEvents
    }),
    locationAlarmEvents = await location.getHistory({
      limit: 1,
      category: 'alarm',
      //offset: 100  - number of events to skip over for pagination
    }),
    locationBeamsEvents = await location.getHistory({
      limit: 1,
      category: 'beams',
    })
  console.log('Location Camera Event', locationCameraEvents.events[0])
  console.log('Location Alarm Event', locationAlarmEvents[0])
  console.log('Location Beams Event', locationBeamsEvents[0])

  console.log('Monitoring Status', await location.getAccountMonitoringStatus())

  // Camera API
  const eventsResponse = await camera.getEvents({
    limit: 10,
    kind: 'ding',
    state: 'accepted',
    // olderThanId: previousEventsResponse.meta.pagination_key
    // favorites: true
  })
  console.log('Got events', eventsResponse.events[0])
  const eventsWithRecordings = eventsResponse.events.filter(
      (event) => event.recording_status === 'ready'
    ),
    transcodedUrl = await camera.getRecordingUrl(
      eventsWithRecordings[0].ding_id_str, // MUST use the ding_id_str, not ding_id
      {
        transcoded: true, // get transcoded version of the video.  false by default.  transcoded has ring log and timestamp
      }
    ),
    untranscodedUrl = await camera.getRecordingUrl(
      eventsWithRecordings[0].ding_id_str
    )

  console.log('Recording Transcoded URL', transcodedUrl)
  console.log('Recording Untranscoded URL', untranscodedUrl)
}

example()
