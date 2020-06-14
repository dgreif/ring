import 'dotenv/config'
import { RingApi } from '../api'
import { cleanOutputDirectory, outputDirectory } from './util'
import * as path from 'path'
import { FfmpegProcess } from '../api/ffmpeg'
import { decodeCryptoValue, getSrtpValue, RtpSplitter } from '../api/rtp-utils'
import { take } from 'rxjs/operators'

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
    camera = cameras.find((x) => x.name.startsWith('Back'))

  if (!camera) {
    console.log('No cameras found')
    return
  }

  // clean/create the output directory
  await cleanOutputDirectory()

  const sipSession = await camera.createSipSession({
      // these should be random crypto keys
      audio: decodeCryptoValue('8rHc1Q2FWUKT3rX/L1GbDKZJ2CsVy9wlEbLygPiq'),
      video: decodeCryptoValue('IxOwCA1T1hMRG2xnjHEULwiSILbDHLyto5NFBX+d'),
    }),
    ringRtpOptions = await sipSession.start({
      output: ['-t', 60, path.join(outputDirectory, 'example.mp4')],
    }),
    ringAudioLocation = {
      port: ringRtpOptions.audio.port,
      address: ringRtpOptions.address,
    },
    audioOutForwarder = new RtpSplitter(({ message }) => {
      // Forwarder is needed so that transcoded audio can be sent out through the same port as audio in
      sipSession.audioSplitter.send(message, ringAudioLocation)
      return null
    }),
    speakerFf = new FfmpegProcess(
      [
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
        getSrtpValue(sipSession.rtpOptions.audio),
        `srtp://127.0.0.1:${await audioOutForwarder.portPromise}?pkt_size=188`,
      ],
      'Return Audio'
    )
  sipSession.onCallEnded.pipe(take(1)).subscribe(() => {
    speakerFf.stop()
    audioOutForwarder.close()
  })

  setTimeout(() => {
    sipSession.stop()
    speakerFf.stop()
    process.exit(0)
  }, 20000)
}

example()
