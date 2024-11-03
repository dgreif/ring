import 'dotenv/config'
import { RingApi } from '../ring-client-api'
import fs from 'node:fs/promises'
import path from 'node:path'
// @ts-expect-error express is not installed by default so you will need to run `npm i express`
import express from 'express'

/**
 * This example creates an hls stream which is viewable in a browser
 * It also starts web app to view the stream at http://localhost:3000
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

  const app = express(),
    publicOutputDirectory = path.join(__dirname, 'public/output')

  app.use('/', express.static(path.join(__dirname, 'public')))
  app.listen(3000, () => {
    console.log(
      'Listening on port 3000.  Go to http://localhost:3000 in your browser',
    )
  })

  if (!(await fs.stat(publicOutputDirectory))) {
    await fs.mkdir(publicOutputDirectory)
  }

  const call = await camera.streamVideo({
    output: [
      '-preset',
      'veryfast',
      '-g',
      '25',
      '-sc_threshold',
      '0',
      '-f',
      'hls',
      '-hls_time',
      '2',
      '-hls_list_size',
      '6',
      '-hls_flags',
      'delete_segments',
      path.join(publicOutputDirectory, 'stream.m3u8'),
    ],
  })

  call.onCallEnded.subscribe(() => {
    console.log('Call has ended')
    process.exit()
  })

  setTimeout(
    function () {
      console.log('Stopping call...')
      call.stop()
    },
    5 * 60 * 1000,
  ) // Stop after 5 minutes.
}

example().catch((e) => {
  console.error(e)
  process.exit(1)
})
