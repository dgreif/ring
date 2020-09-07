import 'dotenv/config'
import { RingApi } from '../api'
import { cleanOutputDirectory, outputDirectory } from './util'
import * as path from 'path'
import {
  encodeSrtpOptions,
  FfmpegProcess,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { take } from 'rxjs/operators'
import { logError, logInfo } from '../api/util'

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

  const sipSession = await camera.createSipSession(),
    ringRtpOptions = await sipSession.start({
      output: ['-t', 60, path.join(outputDirectory, 'example.mp4')],
    }),
    ringAudioLocation = {
      port: ringRtpOptions.audio.port,
      address: ringRtpOptions.address,
    },
    audioOutForwarder = new RtpSplitter(({ message }) => {
      // Splitter is needed so that transcoded audio can be sent out through the same port as audio in
      sipSession.audioSplitter.send(message, ringAudioLocation)
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
        'pcm_mulaw',
        '-flags',
        '+global_header',
        '-ac',
        1,
        '-ar',
        '8k',
        '-f',
        'rtp',
        '-srtp_out_suite',
        'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params',
        encodeSrtpOptions(sipSession.rtpOptions.audio),
        `srtp://127.0.0.1:${await audioOutForwarder.portPromise}?pkt_size=188`,
      ],
      logLabel: 'Return Audio',
      logger: {
        error: logError,
        info: logInfo,
      },
    })
  sipSession.onCallEnded.pipe(take(1)).subscribe(() => {
    speakerFf.stop()
    audioOutForwarder.close()
  })

  // Some older models won't play audio unless the speaker is explicitly activated (doorbell_v3)
  await sipSession.activateCameraSpeaker()

  setTimeout(() => {
    sipSession.stop()
    speakerFf.stop()
    process.exit(0)
  }, 20000)
}

example()
