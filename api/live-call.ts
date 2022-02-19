import { PeerConnection } from './peer-connection'
import { logDebug, logError } from './util'
import { RingCamera } from './ring-camera'
import { concatMap } from 'rxjs/operators'
import {
  FfmpegProcess,
  reservePorts,
  RtpSplitter,
} from '@homebridge/camera-utils'
import { getFfmpegPath } from './ffmpeg'
import { RtpPacket } from '@koush/werift'
import {
  IceCandidateMessage,
  InitializationMessage,
  LiveCallNegotiation,
  OfferMessage,
} from './live-call-negotiation'
import { firstValueFrom } from 'rxjs'

type SpawnInput = string | number
export interface FfmpegOptions {
  input?: SpawnInput[]
  video?: SpawnInput[] | false
  audio?: SpawnInput[]
  output: SpawnInput[]
}

export class LiveCall extends LiveCallNegotiation {
  private readonly pc

  private readonly audioSplitter = new RtpSplitter()
  private readonly videoSplitter = new RtpSplitter()
  readonly onVideoRtp
  readonly onAudioRtp

  constructor(sessionId: string, camera: RingCamera) {
    super(sessionId, camera)

    this.pc = new PeerConnection()

    this.onAudioRtp = this.pc.onAudioRtp
    this.onVideoRtp = this.pc.onVideoRtp

    this.addSubscriptions(
      this.onMessage
        .pipe(
          concatMap((message) => {
            return this.handleMessage(message)
          })
        )
        .subscribe()
    )
  }

  private async handleMessage(
    message: InitializationMessage | OfferMessage | IceCandidateMessage
  ) {
    switch (message.method) {
      case 'sdp':
        const answer = await this.pc.createAnswer(message)

        this.sendAnswer(answer)
        return
      case 'ice':
        await this.pc.addIceCandidate({
          candidate: message.ice,
          sdpMLineIndex: message.mlineindex,
        })
        return
    }
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
      inputSdp = (await firstValueFrom(this.onCallAnswered))
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

  protected callEnded() {
    super.callEnded()

    this.pc.close()
    this.audioSplitter.close()
    this.videoSplitter.close()
  }

  stop() {
    this.callEnded()
  }

  sendAudioPacket(rtp: RtpPacket) {
    this.pc.returnAudioTrack.writeRtp(rtp)
  }
}
