import 'dotenv/config'
import { RingApi } from '../api'
import fs = require('fs')
const path = require('path')
/**
 * An example using the RingCamera's recordLiveVideoToFile function.
 */
async function example() {
  const ringApi = new RingApi({
      // Replace with your ring email/password
      email: process.env.RING_EMAIL!,
      password: process.env.RING_PASS!,
      // Refresh token is used when 2fa is on
      refreshToken: process.env.RING_REFRESH_TOKEN!
    }),
    [camera] = await ringApi.getCameras()

  if (!camera) {
    console.log('No cameras found')
    return
  }
  // Get the absolute path to the examples directory.
  const parsedDirname = path.parse(__dirname)
  parsedDirname.dir = path.resolve(parsedDirname.dir, '../examples/recordings')
  parsedDirname.base = 'my_recording'
  // Create the 'recordings' directory if it doesn't already exist
  !fs.existsSync(parsedDirname.dir) && fs.mkdirSync(parsedDirname.dir)
  // Create the fully qualified filename without the extension, as it is appended automatically.
  console.log('Starting to record live video to file...')
  const pathToVideo = path.format(parsedDirname)
  await camera.recordLiveVideoToFile(pathToVideo, 10)
  console.log('Completed recording.')
  console.log('Your video can be found here: ' + pathToVideo + '.mp4')
  process.exit()
}

example()
