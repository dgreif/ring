import 'dotenv/config'
import { RingApi } from '../api'
import fs = require('fs');

/**
 * An example using the RingCamera's recordLiveVideoToFile function.
 */
async function example() {
  const ringApi = new RingApi({
      // Replace with your ring email/password
      email: "juanjser@gmail.com",
      password: "g00dpassw0rdabc123",
      // Refresh token is used when 2fa is on
      refreshToken: process.env.RING_REFRESH_TOKEN!
    }),
    [camera] = await ringApi.getCameras()

  if (!camera) {
    console.log('No cameras found')
    return
  }
  // Get the absolute path to the examples directory.
  const dirname = __dirname.split("/").slice(0,-2).join("/")+"/examples/recordings/";
  // Create the 'recordings' directory if it doesn't already exist
  !fs.existsSync(dirname) && fs.mkdirSync(dirname);
  // Create the fully qualified filename without the extension, as it is appended automatically.
  const filename = dirname+"my_recording";
  console.log("Starting to record live video to file...")
  await camera.recordLiveVideoToFile(filename, 10)
  console.log("Completed recording.");
  console.log("Your video can be found here: " + filename+".mp4");
  process.exit();
}

example()
