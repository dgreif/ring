import {
  getPayloadType,
  getSrtpValue,
  RtpSplitter,
  SrtpOptions,
} from './rtp-utils'
import { FfmpegProcess } from './ffmpeg'
import path from 'path'
import { BehaviorSubject } from 'rxjs'
import { filter } from 'rxjs/operators'

export class RtpLatchGenerator {
  private onAudioPacket = new BehaviorSubject<Buffer | null>(null)
  private onVideoPacket = new BehaviorSubject<Buffer | null>(null)

  public onAudioLatchPacket = this.onAudioPacket.pipe(
    filter((x): x is Buffer => x !== null)
  )
  public onVideoLatchPacket = this.onVideoPacket.pipe(
    filter((x): x is Buffer => x !== null)
  )

  private latchSplitter = new RtpSplitter()
  private ffLatch?: FfmpegProcess
  private stopped = false

  constructor(
    private audioSrtpOptions: SrtpOptions,
    private videoSrtpOptions: SrtpOptions
  ) {
    this.latchSplitter.portPromise.then((port) => {
      if (this.stopped) {
        return
      }

      this.latchSplitter.addMessageHandler(({ message }) => {
        const payloadType = getPayloadType(message)
        if (payloadType === 0) {
          this.onAudioPacket.next(message)
        } else if (payloadType === 99) {
          this.onVideoPacket.next(message)
        }

        return null
      })

      this.ffLatch = new FfmpegProcess(
        [
          '-hide_banner',
          '-protocol_whitelist',
          'pipe,udp,rtp,file,crypto',
          '-re',
          '-i',
          path.join(path.resolve('media'), 'latch.mp4'),
          '-map',
          '0:a',
          '-acodec',
          'pcm_mulaw',
          '-flags',
          '+global_header',
          '-ac',
          1,
          '-ar',
          '8k',
          '-t',
          10,
          '-f',
          'rtp',
          '-srtp_out_suite',
          'AES_CM_128_HMAC_SHA1_80',
          '-srtp_out_params',
          getSrtpValue(audioSrtpOptions),
          `srtp://127.0.0.1:${port}?pkt_size=188`,
          '-map',
          '0:v',
          '-vcodec',
          'copy',
          '-f',
          'rtp',
          '-payload_type',
          99,
          '-srtp_out_suite',
          'AES_CM_128_HMAC_SHA1_80',
          '-srtp_out_params',
          getSrtpValue(videoSrtpOptions),
          `srtp://127.0.0.1:${port}?pkt_size=188`,
        ],
        ''
      )
    })
  }

  stop() {
    if (this.stopped) {
      return
    }

    this.stopped = true

    this.ffLatch?.stop()
    this.latchSplitter.close()
  }
}
