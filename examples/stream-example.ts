import 'dotenv/config'
import { createSocket } from 'dgram'
import { RingApi } from '../api'
import { bindToRandomPort, getPublicIp } from '../homebridge/rtp-utils'

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

  const videoSocket = createSocket('udp4')
  const audioSocket = createSocket('udp4')

  videoSocket.on('message', message => {
    console.log(message)
  })

  const videoPort = await bindToRandomPort(videoSocket)
  const audioPort = await bindToRandomPort(audioSocket)

  const rtpOptions = {
    address: await getPublicIp(),
    audio: {
      port: audioPort
    },
    video: {
      port: videoPort
    }
  }

  const sipSession = await camera.createSipSession(rtpOptions)

  const ringRtpOptions = await sipSession.getRemoteRtpOptions()

  videoSocket.send('', ringRtpOptions.video.port, ringRtpOptions.address)
  sipSession.startRtp()
  setInterval(() => {
    videoSocket.send('', ringRtpOptions.video.port, ringRtpOptions.address)
  }, 15 * 1000)
}

example()
