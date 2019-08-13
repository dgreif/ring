import 'dotenv/config'
import { RingApi } from '../api'
import { createSocket } from 'dgram'
import { spawn } from 'child_process'
import PacketParser from './packet-parser'
const fs = require('fs'),
  path = require('path')

const OUTPUT_PATH = 'output'

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

  console.log('Creating SIP Session...')
  const sipSession = await camera.createSipSession()
  console.log('Got SIP details.  Ready to start SIP Call...')

  try {
    fs.unlinkSync(OUTPUT_PATH)
  } catch {
    // do nothing.
  }
  fs.mkdirSync(OUTPUT_PATH)

  const ffmpegSocket = createSocket('udp4'),
    // ffmpeg save clip into 10 second parts so the mp4s are playable and not
    // corrupted:
    // https://superuser.com/questions/999400/how-to-use-ffmpeg-to-extract-live-stream-into-a-sequence-of-mp4
    ffmpeg = spawn('ffmpeg', [
      '-i',
      'udp://0.0.0.0:11111',
      '-c',
      'copy',
      '-flags',
      '+global_header',
      '-f',
      'segment',
      '-segment_time',
      '10',
      '-segment_format_options',
      'movflags=+faststart',
      '-reset_timestamps',
      '1',
      path.join(OUTPUT_PATH, 'part%d.mp4')
    ])

  ffmpeg.stderr.on('data', (data: any) => {
    console.log(`stderr: ${data}`)
  })

  ffmpeg.on('close', code => {
    console.log(`child process exited with code ${code}`)
  })

  const exitHandler = () => {
    ffmpeg.stderr.pause()
    ffmpeg.stdout.pause()
    ffmpeg.kill()
    process.exit()
  }

  process.on('SIGINT', exitHandler)
  process.on('exit', exitHandler)

  const packetParser = new PacketParser()
  sipSession.videoStream.onRtpPacket.subscribe(rtpPacket => {
    const decoded = packetParser.packetReceived(rtpPacket.message)
    if (decoded) {
      ffmpegSocket.send(decoded, 11111)
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
