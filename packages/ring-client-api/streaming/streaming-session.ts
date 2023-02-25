import { RtpPacket } from 'werift'
import {
  FfmpegProcess,
  reservePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { firstValueFrom, ReplaySubject, Subject } from 'rxjs'
import { RingEdgeConnection } from './ring-edge-connection'
import { WebrtcConnection } from './webrtc-connection'
import { getFfmpegPath } from '../ffmpeg'
import { logDebug, logError } from '../util'
import { RingCamera } from '../ring-camera'
import { concatMap, map, mergeWith, take } from 'rxjs/operators'
import { Subscribed } from '../subscribed'

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

function getCleanSdp(sdp: string, includeVideo: boolean) {
  return sdp
    .split('\nm=')
    .slice(1)
    .map((section) => 'm=' + section)
    .filter((section) => includeVideo || !section.startsWith('m=video'))
    .join('\n')
}

export class StreamingSession extends Subscribed {
  readonly onCallEnded = new ReplaySubject<void>(1)
  private readonly onUsingOpus = new ReplaySubject<boolean>(1)
  readonly onVideoRtp = new Subject<RtpPacket>()
  readonly onAudioRtp = new Subject<RtpPacket>()

  private readonly audioSplitter = new RtpSplitter()
  private readonly videoSplitter = new RtpSplitter()
  private readonly returnAudioSplitter = new RtpSplitter()

  constructor(
    private readonly camera: RingCamera,
    private connection: RingEdgeConnection | WebrtcConnection
  ) {
    super()

    this.bindToConnection(connection)
  }

  private bindToConnection(connection: RingEdgeConnection | WebrtcConnection) {
    this.addSubscriptions(
      connection.onAudioRtp.subscribe(this.onAudioRtp),
      connection.onVideoRtp.subscribe(this.onVideoRtp),
      connection.onCallAnswered.subscribe((sdp) => {
        this.onUsingOpus.next(sdp.toLocaleLowerCase().includes(' opus/'))
      }),
      connection.onCallEnded.subscribe(() => this.callEnded())
    )
  }

  /**
   * @deprecated
   * activate will be removed in the future. Please use requestKeyFrame if you want to explicitly request an initial key frame
   */
  activate() {
    this.requestKeyFrame()
  }

  cameraSpeakerActivated = false
  activateCameraSpeaker() {
    if (this.cameraSpeakerActivated || this.hasEnded) {
      return
    }
    this.cameraSpeakerActivated = true
    this.connection.activateCameraSpeaker()
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts({ count: bufferPorts + 1 })
    return ports[0]
  }

  get isUsingOpus() {
    return firstValueFrom(
      this.onUsingOpus.pipe(
        mergeWith(
          this.connection.onError.pipe(
            map((e) => {
              throw e
            })
          )
        )
      )
    )
  }

  async startTranscoding(ffmpegOptions: FfmpegOptions) {
    if (this.hasEnded) {
      return
    }

    const videoPort = await this.reservePort(1),
      audioPort = await this.reservePort(1),
      transcodeVideoStream = ffmpegOptions.video !== false,
      ringSdp = await Promise.race([
        firstValueFrom(this.connection.onCallAnswered),
        firstValueFrom(this.onCallEnded),
      ])

    if (!ringSdp) {
      logDebug('Call ended before answered')
      return
    }

    const usingOpus = await this.isUsingOpus,
      ffmpegInputArguments = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        // Ring will answer with either opus or pcmu
        ...(usingOpus ? ['-acodec', 'libopus'] : []),
        '-f',
        'sdp',
        ...(ffmpegOptions.input || []),
        '-i',
        'pipe:',
      ],
      inputSdp = getCleanSdp(ringSdp, transcodeVideoStream)
        .replace(/m=audio \d+/, `m=audio ${audioPort}`)
        .replace(/m=video \d+/, `m=video ${videoPort}`),
      ff = new FfmpegProcess({
        ffmpegArgs: ffmpegInputArguments.concat(
          ...(ffmpegOptions.audio || ['-acodec', 'aac']),
          ...(transcodeVideoStream
            ? ffmpegOptions.video || ['-vcodec', 'copy']
            : []),
          ...(ffmpegOptions.output || [])
        ),
        ffmpegPath: getFfmpegPath(),
        exitCallback: () => this.callEnded(),
        logLabel: `From Ring (${this.camera.name})`,
        logger: {
          error: logError,
          info: logDebug,
        },
      })

    this.addSubscriptions(
      this.onAudioRtp
        .pipe(
          concatMap((rtp) => {
            return this.audioSplitter.send(rtp.serialize(), {
              port: audioPort,
            })
          })
        )
        .subscribe()
    )

    if (transcodeVideoStream) {
      this.addSubscriptions(
        this.onVideoRtp
          .pipe(
            concatMap((rtp) => {
              return this.videoSplitter.send(rtp.serialize(), {
                port: videoPort,
              })
            })
          )
          .subscribe()
      )
    }

    this.onCallEnded.pipe(take(1)).subscribe(() => ff.stop())

    ff.writeStdin(inputSdp)

    // Request a key frame now that ffmpeg is ready to receive
    this.requestKeyFrame()
  }

  async transcodeReturnAudio(ffmpegOptions: { input: SpawnInput[] }) {
    if (this.hasEnded) {
      return
    }

    const audioOutForwarder = new RtpSplitter(({ message }) => {
        const rtp = RtpPacket.deSerialize(message)
        this.connection.sendAudioPacket(rtp)
        return null
      }),
      usingOpus = await this.isUsingOpus,
      ff = new FfmpegProcess({
        ffmpegArgs: [
          '-hide_banner',
          '-protocol_whitelist',
          'pipe,udp,rtp,file,crypto',
          '-re',
          '-i',
          ...ffmpegOptions.input,
          '-acodec',
          ...(usingOpus
            ? ['libopus', '-ac', 2, '-ar', '48k']
            : ['pcm_mulaw', '-ac', 1, '-ar', '8k']),
          '-flags',
          '+global_header',
          '-f',
          'rtp',
          `rtp://127.0.0.1:${await audioOutForwarder.portPromise}`,
        ],
        ffmpegPath: getFfmpegPath(),
        exitCallback: () => this.callEnded(),
        logLabel: `Return Audio (${this.camera.name})`,
        logger: {
          error: logError,
          info: logDebug,
        },
      })
    this.onCallEnded.pipe(take(1)).subscribe(() => ff.stop())
  }

  private hasEnded = false
  private callEnded() {
    if (this.hasEnded) {
      return
    }
    this.hasEnded = true

    this.unsubscribe()
    this.onCallEnded.next()
    this.connection.stop()
    this.audioSplitter.close()
    this.videoSplitter.close()
    this.returnAudioSplitter.close()
  }

  stop() {
    this.callEnded()
  }

  sendAudioPacket(rtp: RtpPacket) {
    if (this.hasEnded) {
      return
    }

    this.connection.sendAudioPacket(rtp)
  }

  requestKeyFrame() {
    this.connection.requestKeyFrame()
  }
}
