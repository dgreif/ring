import 'dotenv/config'
import { RingApi } from '../api'

async function example() {
  const ringApi = new RingApi({
    // Replace with your ring email/password
    email: process.env.RING_EMAIL!,
    password: process.env.RING_PASS!,
    // Refresh token is used when 2fa is on
    refreshToken: process.env.RING_REFRESH_TOKEN!,
    // Listen for dings and motion events
    cameraDingsPollingSeconds: 2
  })

  const cameras = await ringApi.getCameras()
  const camera = cameras.find(camera => camera.data.description === 'Backyard')

  if (!camera) {
    return
  }

  const sipSession = await camera.createSipSession()

  sipSession.audioStream.onRtpPacket.subscribe(rtpPacket => {})
  sipSession.videoStream.onRtpPacket.subscribe(rtpPacket => {
    console.log(rtpPacket)
  })
  sipSession.onEndDone.subscribe(() => {
    process.exit()
  })

  await sipSession.start()

  setTimeout(function() {
    sipSession.stop()
  }, 2 * 60 * 1000) // Stop after 2 minutes.
}

example()
