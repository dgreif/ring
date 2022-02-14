import 'dotenv/config'
import { RingApi } from '../api'
import { cleanOutputDirectory } from './util'
import * as path from 'path'
import { FfmpegProcess, RtpSplitter } from '@homebridge/camera-utils'
import { take } from 'rxjs/operators'
import { logError, logInfo } from '../api/util'
import { RtpPacket } from '@koush/werift'

/**
 * This example takes an audio clip from examples/example.mp4 and pipes it to a ring camera
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

  const call = await camera.startLiveCall(),
    audioOutForwarder = new RtpSplitter(({ message }) => {
      const rtp = RtpPacket.deSerialize(message)
      call.sendAudioPacket(rtp)
      return null
    }),
    speakerFf = new FfmpegProcess({
      ffmpegArgs: [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-re',
        '-i',
        path.join(path.resolve('examples'), 'example.mp4'),
        '-acodec',
        'libopus',
        '-flags',
        '+global_header',
        '-ac',
        2,
        '-ar',
        '48k',
        '-f',
        'rtp',
        `rtp://127.0.0.1:${await audioOutForwarder.portPromise}`,
      ],
      logLabel: 'Return Audio',
      logger: {
        error: logError,
        info: logInfo,
      },
    })
  call.onCallEnded.pipe(take(1)).subscribe(() => {
    speakerFf.stop()
    audioOutForwarder.close()
  })

  // Some older models won't play audio unless the speaker is explicitly activated (doorbell_v3)
  await call.activateCameraSpeaker()

  setTimeout(() => {
    call.stop()
    speakerFf.stop()
    process.exit(0)
  }, 20000)
}

example().catch(logError)
