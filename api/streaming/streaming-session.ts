import { RtpPacket } from '@koush/werift'
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
import { concatMap } from 'rxjs/operators'
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
  readonly onVideoRtp = new Subject<RtpPacket>()
  readonly onAudioRtp = new Subject<RtpPacket>()

  private readonly audioSplitter = new RtpSplitter()
  private readonly videoSplitter = new RtpSplitter()

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
      connection.onVideoRtp.subscribe(this.onVideoRtp)
    )
  }

  activated = false
  async activate() {
    if (this.activated) {
      return
    }
    this.activated = true
    await this.connection.activate()
  }

  cameraSpeakerActivated = false
  async activateCameraSpeaker() {
    if (this.cameraSpeakerActivated) {
      return
    }
    this.cameraSpeakerActivated = true
    await this.connection.activateCameraSpeaker()
  }

  async reservePort(bufferPorts = 0) {
    const ports = await reservePorts({ count: bufferPorts + 1 })
    return ports[0]
  }

  async startTranscoding(ffmpegOptions: FfmpegOptions) {
    const videoPort = await this.reservePort(1),
      audioPort = await this.reservePort(1),
      transcodeVideoStream = ffmpegOptions.video !== false,
      ffmpegInputArguments = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-acodec',
        'libopus',
        '-f',
        'sdp',
        ...(ffmpegOptions.input || []),
        '-i',
        'pipe:',
      ],
      ringSdp = await firstValueFrom(this.connection.onCallAnswered),
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

    this.onCallEnded.subscribe(() => ff.stop())

    ff.writeStdin(inputSdp)

    // Activate the stream now that ffmpeg is ready to receive
    await this.activate()
  }

  private callEnded() {
    this.unsubscribe()
    this.onCallEnded.next()
    this.connection.stop()
    this.audioSplitter.close()
    this.videoSplitter.close()
  }

  stop() {
    this.callEnded()
  }

  sendAudioPacket(rtp: RtpPacket) {
    this.connection.sendAudioPacket(rtp)
  }
}
