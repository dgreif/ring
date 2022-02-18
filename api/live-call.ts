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
import { SpawnInput, FfmpegOptions } from './ffmpeg-options'

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

  public prepareTranscoder(
    transcodeVideoStream: boolean,
    ffmpegInputOptions: SpawnInput[] | undefined,
    audioPort: number,
    videoPort: number,
    sdpInput: string
  ) {
    const ffmpegInputArguments = [
        '-hide_banner',
        '-protocol_whitelist',
        'pipe,udp,rtp,file,crypto',
        '-acodec',
        'libopus',
        '-f',
        'sdp',
        ...(ffmpegInputOptions || []),
        '-i',
        sdpInput,
      ],
      inputSdpLines = [
        'v=0',
        'o=105202070 3747 461 IN IP4 127.0.0.1',
        's=Talk',
        'c=IN IP4 127.0.0.1',
        'b=AS:380',
        't=0 0',
        'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',
        `m=audio ${audioPort} RTP/SAVP 101`,
        'a=rtpmap:101 OPUS/48000/2',
        'a=rtcp-fb:101 nack pli',
        'a=fmtp:101 useinbandfec=1;sprop-stereo=0',
        'a=rtcp-mux',
      ]

    if (transcodeVideoStream) {
      inputSdpLines.push(
        `m=video ${videoPort} RTP/SAVP 96`,
        'a=rtpmap:96 H264/90000',
        'a=rtcp-fb:96 nack',
        'a=rtcp-fb:96 nack pli',
        'a=fmtp:96 packetization-mode=1;profile-level-id=640029;level-asymmetry-allowed=1',
        'a=rtcp-mux'
      )

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

    return {
      ffmpegInputArguments,
      inputSdpLines,
    }
  }

  async startTranscoding(ffmpegOptions: FfmpegOptions) {
    const videoPort = await this.reservePort(1),
      audioPort = await this.reservePort(1),
      transcodeVideoStream = ffmpegOptions.video !== false,
      { ffmpegInputArguments, inputSdpLines } = this.prepareTranscoder(
        transcodeVideoStream,
        ffmpegOptions.input,
        audioPort,
        videoPort,
        'pipe:'
      ),
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

    this.onCallEnded.subscribe(() => ff.stop())

    ff.writeStdin(inputSdpLines.filter((x) => Boolean(x)).join('\n'))

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
