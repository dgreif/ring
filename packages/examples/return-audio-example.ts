import 'dotenv/config'
import { RingApi } from '../ring-client-api'
import { cleanOutputDirectory } from './util'
import * as path from 'path'

/**
 * This example takes an audio clip from examples/example.mp4 and pipes it to a ring camera
 **/

async function example() {
  const ringApi = new RingApi({
      // Replace with your refresh token
      refreshToken: process.env.RING_REFRESH_TOKEN!,
      debug: true,
    }),
    cameras = await ringApi.getCameras(),
    camera = cameras[0]

  if (!camera) {
    console.log('No cameras found')
    return
  }

  // clean/create the output directory
  await cleanOutputDirectory()

  console.log(`Starting Return Audio to ${camera.name}...`)
  const call = await camera.startLiveCall()

  console.log('Call started, activating return audio...')
  await Promise.all([
    call.transcodeReturnAudio({
      // You can specify any normal ffmpeg input here. In this case, we are just playing from a file
      input: [path.join(__dirname, 'example.mp4')],
    }),
    // We need to manually tell the speaker to activate when we are ready to play audio out of the speaker
    call.activateCameraSpeaker(),
  ])

  setTimeout(() => {
    call.stop()
    process.exit(0)
  }, 10000)
}

example().catch((e) => {
  console.error(e)
  process.exit(1)
})
