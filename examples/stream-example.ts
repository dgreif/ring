import 'dotenv/config'
import { RingApi } from '../api'

async function example() {
  const ringApi = new RingApi({
    // Replace with your ring email/password
    email: process.env.RING_EMAIL!,
    password: process.env.RING_PASS!,
    // Refresh token is used when 2fa is on
    refreshToken: process.env.RING_REFRESH_TOKEN!
  })

  const [camera] = await ringApi.getCameras()

  if (!camera) {
    console.log('No cameras found')
    return
  }

  console.log('Creating SIP Session...')
  const sipSession = await camera.createSipSession()
  console.log('Got SIP details.  Ready to start SIP Call...')

  let audioCount = 0,
    videoCount = 0

  sipSession.audioStream.onRtpPacket.subscribe(rtpPacket => {
    if (audioCount++ % 100 === 0) {
      console.log(
        `Audio Packet - ${rtpPacket.message.length} bytes from ${rtpPacket.info.address}:${rtpPacket.info.port}`
      )
    }
  })
  sipSession.videoStream.onRtpPacket.subscribe(rtpPacket => {
    if (videoCount++ % 500 === 0) {
      console.log(
        `Video Packet - ${rtpPacket.message.length} bytes from ${rtpPacket.info.address}:${rtpPacket.info.port}`
      )
    }
  })

  sipSession.onCallEnded.subscribe(() => {
    console.log('Call has ended')
    process.exit()
  })

  console.log('Starting SIP call')
  const rtpOptions = await sipSession.start()
  console.log('Call Started.  Remote RTP details:', rtpOptions)

  setTimeout(function() {
    console.log('Stopping call...')
    sipSession.stop()
  }, 2 * 60 * 1000) // Stop after 2 minutes.
}

example()
