import 'dotenv/config'
import { RingApi } from '../api'
import { cleanOutputDirectory, outputDirectory } from './util'
import * as path from 'path'

/**
 * This example records a 10 second video clip to output/example.mp4
 **/

async function example() {
  const ringApi = new RingApi({
      // Replace with your refresh token
      refreshToken: process.env.RING_REFRESH_TOKEN!,
      debug: true,
    }),
    [camera] = await ringApi.getCameras()

  if (!camera) {
    console.log('No cameras found')
    return
  }

  // clean/create the output directory
  await cleanOutputDirectory()

  console.log('Starting Video...')
  await camera.recordToFile(path.join(outputDirectory, 'example.mp4'), 10)
  console.log('Done recording video')
  process.exit(0)
}

example()
