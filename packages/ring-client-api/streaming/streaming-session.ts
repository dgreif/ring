import { RtpPacket } from 'werift'
import {
  FfmpegProcess,
  reservePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { firstValueFrom, ReplaySubject, Subject } from 'rxjs'
import type { WebrtcConnection } from './webrtc-connection.ts'
import { getFfmpegPath } from '../ffmpeg.ts'
import { logDebug, logError, logInfo } from '../util.ts'
import type { RingCamera } from '../ring-camera.ts'
import { concatMap, map, mergeWith, take } from 'rxjs/operators'
import { Subscribed } from '../subscribed.ts'

type SpawnInput = string | number
type RtpState = {
  generation: number
  inputSequenceNumber: number
  inputTimestamp: number
  outputSequenceNumber: number
  outputTimestamp: number
  timestampIncrement: number
}

function unsignedDelta(value: number, previousValue: number, bits: 16 | 32) {
  const modulus = 2 ** bits
  return (value - previousValue + modulus) % modulus
}

export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  stdoutCallback?: (data: Buffer) => void
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
  private readonly camera
  private connection
  private readonly createConnection
  private videoRtpState?: RtpState
  private audioRtpState?: RtpState
  private connectionGeneration = 0

  constructor(
    camera: RingCamera,
    connection: WebrtcConnection,
    createConnection: () => Promise<WebrtcConnection>,
  ) {
    super()

    this.camera = camera
    this.connection = connection
    this.createConnection = createConnection
    this.bindToConnection(connection)
  }

  private bindToConnection(connection: WebrtcConnection) {
    const generation = this.connectionGeneration++

    this.addSubscriptions(
      connection.onAudioRtp.subscribe((rtp) => {
        this.forwardRtp(rtp, 'audio', generation)
      }),
      connection.onVideoRtp.subscribe((rtp) => {
        this.forwardRtp(rtp, 'video', generation)
      }),
      connection.onCallAnswered.subscribe((sdp) => {
        this.onUsingOpus.next(sdp.toLocaleLowerCase().includes(' opus/'))

        if (generation > 0) {
          logInfo(`Reconnected stream for ${this.camera.name}`)
          connection.requestKeyFrame()
        }
      }),
      connection.onCallEnded.subscribe((reason) => {
        if (reason?.code === 10 && reason.text === 'answered_timeout') {
          this.reconnect().catch(logError)
          return
        }

        this.callEnded()
      }),
    )
  }

  private forwardRtp(
    rtp: RtpPacket,
    media: 'audio' | 'video',
    generation: number,
  ) {
    const stateProperty = media === 'video' ? 'videoRtpState' : 'audioRtpState',
      subject = media === 'video' ? this.onVideoRtp : this.onAudioRtp,
      state = this[stateProperty]

    if (!state) {
      this[stateProperty] = {
        generation,
        inputSequenceNumber: rtp.header.sequenceNumber,
        inputTimestamp: rtp.header.timestamp,
        outputSequenceNumber: rtp.header.sequenceNumber,
        outputTimestamp: rtp.header.timestamp,
        timestampIncrement: media === 'video' ? 3000 : 960,
      }
      subject.next(rtp)
      return
    }

    const isNewConnection = state.generation !== generation,
      sequenceIncrement = isNewConnection
        ? 1
        : unsignedDelta(
            rtp.header.sequenceNumber,
            state.inputSequenceNumber,
            16,
          ),
      inputTimestampIncrement = unsignedDelta(
        rtp.header.timestamp,
        state.inputTimestamp,
        32,
      ),
      timestampIncrement = isNewConnection
        ? state.timestampIncrement
        : inputTimestampIncrement

    state.generation = generation
    state.inputSequenceNumber = rtp.header.sequenceNumber
    state.inputTimestamp = rtp.header.timestamp
    state.outputSequenceNumber =
      (state.outputSequenceNumber + sequenceIncrement) & 0xffff
    state.outputTimestamp = (state.outputTimestamp + timestampIncrement) >>> 0

    if (!isNewConnection && inputTimestampIncrement > 0) {
      state.timestampIncrement = inputTimestampIncrement
    }

    rtp.header.sequenceNumber = state.outputSequenceNumber
    rtp.header.timestamp = state.outputTimestamp
    subject.next(rtp)
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
            }),
          ),
        ),
      ),
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
          ...(ffmpegOptions.output || []),
        ),
        ffmpegPath: getFfmpegPath(),
        stdoutCallback: ffmpegOptions.stdoutCallback,
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
          }),
        )
        .subscribe(),
    )

    if (transcodeVideoStream) {
      this.addSubscriptions(
        this.onVideoRtp
          .pipe(
            concatMap((rtp) => {
              return this.videoSplitter.send(rtp.serialize(), {
                port: videoPort,
              })
            }),
          )
          .subscribe(),
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

  private reconnecting = false

  private async reconnect() {
    if (this.reconnecting || this.hasEnded) {
      return
    }

    this.reconnecting = true

    try {
      const connection = await this.createConnection()

      if (this.hasEnded) {
        connection.stop()
        return
      }

      this.connection = connection
      logInfo(`Reconnecting stream for ${this.camera.name}`)
      this.bindToConnection(connection)
    } catch (error) {
      logError(`Failed to reconnect stream for ${this.camera.name}`)
      logError(error)
      this.callEnded()
    } finally {
      this.reconnecting = false
    }
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
