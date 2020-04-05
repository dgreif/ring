import 'dotenv/config'
import { RingApi } from '../api'
import * as path from 'path'
import { cleanOutputDirectory, outputDirectory } from './util'

/**
 * This example streams to files, each with 10 seconds of video.
 * The output will be in output/part${part #}.mp4
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

  await cleanOutputDirectory()

  console.log('Starting Video...')
  const sipSession = await camera.streamVideo({
    // save video 10 second parts so the mp4s are playable and not corrupted:
    // https://superuser.com/questions/999400/how-to-use-ffmpeg-to-extract-live-stream-into-a-sequence-of-mp4
    output: [
      '-flags',
      '+global_header',
      '-f',
      'segment',
      '-segment_time',
      '10', // 10 seconds
      '-segment_format_options',
      'movflags=+faststart',
      '-reset_timestamps',
      '1',
      path.join(outputDirectory, 'part%d.mp4'),
    ],
  })
  console.log('Video started, streaming to part files...')

  sipSession.onCallEnded.subscribe(() => {
    console.log('Call has ended')
    process.exit()
  })

  setTimeout(function () {
    console.log('Stopping call...')
    sipSession.stop()
  }, 60 * 1000) // Stop after 1 minute
}

example()
