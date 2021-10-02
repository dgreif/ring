import 'dotenv/config'
import { RingApi } from '../api'
import { cleanOutputDirectory, outputDirectory } from './util'
import * as path from 'path'
import { logError } from '../api/util'

/**
 * This example records a 10 second video clip to output/example.mp4
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

  console.log(`Starting Video from ${camera.name} ...`)
  await camera.recordToFile(path.join(outputDirectory, 'example.mp4'), 10)
  console.log('Done recording video')
  process.exit(0)
}

example().catch(logError)
