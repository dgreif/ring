import { RingCamera } from 'ring-client-api'
import { hap } from './hap'
import {
  doesFfmpegSupportCodec,
  generateSrtpOptions,
  ReturnAudioTranscoder,
  RtpSplitter,
  SrtpOptions,
} from '@homebridge/camera-utils'
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraStreamingDelegate,
  H264Level,
  H264Profile,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StartStreamRequest,
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge'
import { logDebug, logError, logInfo } from 'ring-client-api/util'
import { debounceTime, delay, take } from 'rxjs/operators'
import { interval, merge, of, Subject } from 'rxjs'
import { readFile } from 'fs'
import { promisify } from 'util'
import { getFfmpegPath } from 'ring-client-api/ffmpeg'
import {
  RtcpSenderInfo,
  RtcpSrPacket,
  RtpPacket,
  SrtpSession,
  SrtcpSession,
} from 'werift'
import type { StreamingSession } from 'ring-client-api/lib/streaming/streaming-session'
import { OpusRepacketizer } from './opus-repacketizer'

const readFileAsync = promisify(readFile),
  cameraOfflinePath = require.resolve('../media/camera-offline.jpg'),
  snapshotsBlockedPath = require.resolve('../media/snapshots-blocked.jpg')

function getDurationSeconds(start: number) {
  return (Date.now() - start) / 1000
}

function getSessionConfig(srtpOptions: SrtpOptions) {
  return {
    keys: {
      localMasterKey: srtpOptions.srtpKey,
      localMasterSalt: srtpOptions.srtpSalt,
      remoteMasterKey: srtpOptions.srtpKey,
      remoteMasterSalt: srtpOptions.srtpSalt,
    },
    profile: 1,
  }
}

class StreamingSessionWrapper {
  audioSsrc = hap.CameraController.generateSynchronisationSource()
  videoSsrc = hap.CameraController.generateSynchronisationSource()
  audioSrtp = generateSrtpOptions()
  videoSrtp = generateSrtpOptions()
  audioSplitter = new RtpSplitter()
  videoSplitter = new RtpSplitter()
  repacketizeAudioSplitter = new RtpSplitter()

  libfdkAacInstalledPromise = doesFfmpegSupportCodec(
    'libfdk_aac',
    getFfmpegPath(),
  )
    .then((supported) => {
      if (!supported) {
        logError(
          'Streaming video only - found ffmpeg, but libfdk_aac is not installed. See https://github.com/dgreif/ring/wiki/FFmpeg for details.',
        )
      }
      return supported
    })
    .catch(() => {
      logError(
        'Streaming video only - ffmpeg was not found. See https://github.com/dgreif/ring/wiki/FFmpeg for details.',
      )
      return false
    })

  constructor(
    public streamingSession: StreamingSession,
    public prepareStreamRequest: PrepareStreamRequest,
    public ringCamera: RingCamera,
    public start: number,
  ) {
    const {
        targetAddress,
        video: { port: videoPort },
      } = prepareStreamRequest,
      // used to encrypt rtcp to HomeKit for keepalive
      videoSrtcpSession = new SrtcpSession(getSessionConfig(this.videoSrtp)),
      onReturnPacketReceived = new Subject()

    // Watch return packets to detect a dead stream from the HomeKit side
    // This can happen if the user force-quits the Home app
    this.videoSplitter.addMessageHandler(() => {
      // return packet from HomeKit
      onReturnPacketReceived.next(null)
      return null
    })
    this.audioSplitter.addMessageHandler(() => {
      // return packet from HomeKit
      onReturnPacketReceived.next(null)
      return null
    })
    streamingSession.addSubscriptions(
      merge(of(true).pipe(delay(15000)), onReturnPacketReceived)
        .pipe(debounceTime(5000))
        .subscribe(() => {
          logInfo(
            `Live stream for ${
              this.ringCamera.name
            } appears to be inactive. (${getDurationSeconds(start)}s)`,
          )
          streamingSession.stop()
        }),
    )

    // Periodically send a blank RTCP packet to the HomeKit video port
    // Without this, HomeKit assumes the stream is dead after 30 second and sends a stop request
    streamingSession.addSubscriptions(
      interval(500).subscribe(() => {
        const senderInfo = new RtcpSenderInfo({
            ntpTimestamp: BigInt(0),
            packetCount: 0,
            octetCount: 0,
            rtpTimestamp: 0,
          }),
          senderReport = new RtcpSrPacket({
            ssrc: this.videoSsrc,
            senderInfo: senderInfo,
          }),
          message = videoSrtcpSession.encrypt(senderReport.serialize())

        this.videoSplitter
          .send(message, {
            port: videoPort,
            address: targetAddress,
          })
          .catch(logError)
      }),
    )
  }

  private listenForAudioPackets(startStreamRequest: StartStreamRequest) {
    const {
        targetAddress,
        audio: { port: audioPort },
      } = this.prepareStreamRequest,
      {
        audio: {
          codec: audioCodec,
          sample_rate: audioSampleRate,
          packet_time: audioPacketTime,
        },
      } = startStreamRequest,
      // Repacketize the audio stream after it's been transcoded
      opusRepacketizer = new OpusRepacketizer(audioPacketTime / 20),
      audioIntervalScale = ((audioSampleRate / 8) * audioPacketTime) / 20,
      audioSrtpSession = new SrtpSession(getSessionConfig(this.audioSrtp))

    let firstTimestamp: number,
      audioPacketCount = 0

    this.repacketizeAudioSplitter.addMessageHandler(({ message }) => {
      let rtp: RtpPacket | undefined = RtpPacket.deSerialize(message)

      if (audioCodec === AudioStreamingCodecType.OPUS) {
        // borrowed from scrypted
        // Original source: https://github.com/koush/scrypted/blob/c13ba09889c3e0d9d3724cb7d49253c9d787fb97/plugins/homekit/src/types/camera/camera-streaming-srtp-sender.ts#L124-L143
        rtp = opusRepacketizer.repacketize(rtp)

        if (!rtp) {
          return null
        }

        if (!firstTimestamp) {
          firstTimestamp = rtp.header.timestamp
        }

        // from HAP spec:
        // RTP Payload Format for Opus Speech and Audio Codec RFC 7587 with an exception
        // that Opus audio RTP Timestamp shall be based on RFC 3550.
        // RFC 3550 indicates that PCM audio based with a sample rate of 8k and a packet
        // time of 20ms would have a monotonic interval of 8k / (1000 / 20) = 160.
        // So 24k audio would have a monotonic interval of (24k / 8k) * 160 = 480.
        // HAP spec also states that it may request packet times of 20, 30, 40, or 60.
        // In practice, HAP has been seen to request 20 on LAN and 60 over LTE.
        // So the RTP timestamp must scale accordingly.
        // Further investigation indicates that HAP doesn't care about the actual sample rate at all,
        // that's merely a suggestion. When encoding Opus, it can seemingly be an arbitrary sample rate,
        // audio will work so long as the rtp timestamps are created properly: which is a construct of the sample rate
        // HAP requests, and the packet time is respected,
        // opus 48khz will work just fine.
        rtp.header.timestamp =
          (firstTimestamp + audioPacketCount * 160 * audioIntervalScale) %
          0xffffffff
        audioPacketCount++
      }

      // encrypt the packet
      const encryptedPacket = audioSrtpSession.encrypt(rtp.payload, rtp.header)

      // send the encrypted packet to HomeKit
      this.audioSplitter
        .send(encryptedPacket, {
          port: audioPort,
          address: targetAddress,
        })
        .catch(logError)

      return null
    })
  }

  async activate(request: StartStreamRequest) {
    let sentVideo = false
    const {
        targetAddress,
        video: { port: videoPort },
      } = this.prepareStreamRequest,
      // use to encrypt Ring video to HomeKit
      videoSrtpSession = new SrtpSession(getSessionConfig(this.videoSrtp))

    // Set up packet forwarding for video stream
    this.streamingSession.addSubscriptions(
      this.streamingSession.onVideoRtp.subscribe(({ header, payload }) => {
        header.ssrc = this.videoSsrc
        header.payloadType = request.video.pt

        const encryptedPacket = videoSrtpSession.encrypt(payload, header)

        if (!sentVideo) {
          sentVideo = true
          logInfo(
            `Received stream data from ${
              this.ringCamera.name
            } (${getDurationSeconds(this.start)}s)`,
          )
        }

        this.videoSplitter
          .send(encryptedPacket, {
            port: videoPort,
            address: targetAddress,
          })
          .catch(logError)
      }),
    )

    const shouldTranscodeAudio = await this.libfdkAacInstalledPromise
    if (!shouldTranscodeAudio) {
      return this.streamingSession.requestKeyFrame()
    }

    const transcodingPromise = this.streamingSession.startTranscoding({
      input: ['-vn'],
      audio: [
        '-map',
        '0:a',

        ...(request.audio.codec === AudioStreamingCodecType.OPUS
          ? [
              // OPUS specific - it works, but audio is very choppy
              '-acodec',
              'libopus',
              '-frame_duration',
              request.audio.packet_time,
              //'-application', //commented to work in mobile context. 
              //'lowdelay',
            ]
          : [
              // AAC-eld specific
              '-acodec',
              'libfdk_aac',
              '-profile:a',
              'aac_eld',
              '-eld_sbr:a',
              '1',
              '-eld_v2',
              '1',
            ]),

        // Shared options
        '-flags',
        '+global_header',
        '-ac',
        `${request.audio.channel}`,
        '-ar',
        `${request.audio.sample_rate}k`,
        '-b:a',
        `${request.audio.max_bit_rate}k`,
        '-bufsize',
        `${request.audio.max_bit_rate * 4}k`,
        '-payload_type',
        request.audio.pt,
        '-ssrc',
        this.audioSsrc,
        '-f',
        'rtp',
        `rtp://127.0.0.1:${await this.repacketizeAudioSplitter
          .portPromise}?pkt_size=376`,
      ],
      video: false,
      output: [],
    })

    let cameraSpeakerActive = false
    // used to send return audio from HomeKit to Ring
    const returnAudioTranscodedSplitter = new RtpSplitter(({ message }) => {
        if (!cameraSpeakerActive) {
          cameraSpeakerActive = true
          this.streamingSession.activateCameraSpeaker()
        }

        // deserialize and send to Ring - werift will handle encryption and other header params
        try {
          const rtp: RtpPacket | undefined = RtpPacket.deSerialize(message)
          this.streamingSession.sendAudioPacket(rtp)
        } catch (_) {
          // deSerialize will sometimes fail, but the errors can be ignored
        }

        return null
      }),
      isRingUsingOpus = await this.streamingSession.isUsingOpus,
      returnAudioTranscoder = new ReturnAudioTranscoder({
        prepareStreamRequest: this.prepareStreamRequest,
        startStreamRequest: request,
        incomingAudioOptions: {
          ssrc: this.audioSsrc,
          rtcpPort: 0, // we don't care about rtcp for incoming audio
        },
        outputArgs: [
          '-acodec',
          ...(isRingUsingOpus
            ? [
                'libopus',
                '-ac',
                '1',
                '-ar',
                '24k',
                '-b:a',
                '24k',
                '-application',
                'lowdelay',
              ]
            : ['pcm_mulaw', '-ac', 1, '-ar', '8k']),
          '-flags',
          '+global_header',
          '-f',
          'rtp',
          `rtp://127.0.0.1:${await returnAudioTranscodedSplitter.portPromise}`,
        ],
        ffmpegPath: getFfmpegPath(),
        logger: {
          info: logDebug,
          error: logError,
        },
        logLabel: `Return Audio (${this.ringCamera.name})`,
        returnAudioSplitter: this.audioSplitter,
      })

    this.streamingSession.onCallEnded.pipe(take(1)).subscribe(() => {
      returnAudioTranscoder.stop()
      returnAudioTranscodedSplitter.close()
    })

    this.listenForAudioPackets(request)
    await returnAudioTranscoder.start()
    await transcodingPromise
  }

  stop() {
    this.audioSplitter.close()
    this.repacketizeAudioSplitter.close()
    this.videoSplitter.close()
    this.streamingSession.stop()
  }
}

export class CameraSource implements CameraStreamingDelegate {
  public controller = new hap.CameraController({
    cameraStreamCount: 10,
    delegate: this,
    streamingOptions: {
      supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: {
        resolutions: [
          [1280, 720, 30],
          [1024, 768, 30],
          [640, 480, 30],
          [640, 360, 30],
          [480, 360, 30],
          [480, 270, 30],
          [320, 240, 30],
          [320, 240, 15], // Apple Watch requires this configuration
          [320, 180, 30],
        ],
        codec: {
          profiles: [H264Profile.BASELINE],
          levels: [H264Level.LEVEL3_1],
        },
      },
      audio: {
        codecs: this.useOpus
          ? [
              {
                type: AudioStreamingCodecType.OPUS,
                // required by watch
                samplerate: AudioStreamingSamplerate.KHZ_8,
              },
              {
                type: AudioStreamingCodecType.OPUS,
                samplerate: AudioStreamingSamplerate.KHZ_16,
              },
              {
                type: AudioStreamingCodecType.OPUS,
                samplerate: AudioStreamingSamplerate.KHZ_24,
              },
            ]
          : [
              {
                type: AudioStreamingCodecType.AAC_ELD,
                samplerate: AudioStreamingSamplerate.KHZ_16,
              },
            ],
      },
    },
  })
  private sessions: { [sessionKey: string]: StreamingSessionWrapper } = {}
  private cachedSnapshot?: Buffer

  constructor(
    private ringCamera: RingCamera,
    private useOpus = false,
  ) {}

  private previousLoadSnapshotPromise?: Promise<any>
  async loadSnapshot(imageUuid?: string) {
    // cache a promise of the snapshot load
    // This prevents multiple concurrent requests for snapshot from pilling up and creating lots of logs
    if (this.previousLoadSnapshotPromise) {
      return this.previousLoadSnapshotPromise
    }

    this.previousLoadSnapshotPromise = this.loadAndCacheSnapshot(imageUuid)

    try {
      await this.previousLoadSnapshotPromise
    } catch (_) {
      // ignore errors
    } finally {
      // clear so another request can be made
      this.previousLoadSnapshotPromise = undefined
    }
  }

  fn = 1
  private async loadAndCacheSnapshot(imageUuid?: string) {
    const start = Date.now()
    logDebug(
      `Loading new snapshot into cache for ${this.ringCamera.name}${
        imageUuid ? ' by uuid' : ''
      }`,
    )

    try {
      const previousSnapshot = this.cachedSnapshot,
        newSnapshot = await this.ringCamera.getSnapshot({ uuid: imageUuid })
      this.cachedSnapshot = newSnapshot

      if (previousSnapshot !== newSnapshot) {
        // Keep the snapshots in cache 2 minutes longer than their lifetime
        // This allows users on LTE with wired camera to get snapshots each 60 second pull even though the cached snapshot is out of date
        setTimeout(
          () => {
            if (this.cachedSnapshot === newSnapshot) {
              this.cachedSnapshot = undefined
            }
          },
          this.ringCamera.snapshotLifeTime + 2 * 60 * 1000,
        )
      }

      logDebug(
        `Snapshot cached for ${this.ringCamera.name}${
          imageUuid ? ' by uuid' : ''
        } (${getDurationSeconds(start)}s)`,
      )
    } catch (e: any) {
      this.cachedSnapshot = undefined
      logDebug(
        `Failed to cache snapshot for ${
          this.ringCamera.name
        } (${getDurationSeconds(
          start,
        )}s), The camera currently reports that it is ${
          this.ringCamera.isOffline ? 'offline' : 'online'
        }`,
      )

      // log additioanl snapshot error message if one is present
      if (e.message.includes('Snapshot')) {
        logDebug(e.message)
      }
    }
  }

  private getCurrentSnapshot() {
    if (this.ringCamera.isOffline) {
      return readFileAsync(cameraOfflinePath)
    }

    if (this.ringCamera.snapshotsAreBlocked) {
      return readFileAsync(snapshotsBlockedPath)
    }

    logDebug(
      `${
        this.cachedSnapshot ? 'Used cached snapshot' : 'No snapshot cached'
      } for ${this.ringCamera.name}`,
    )

    if (!this.ringCamera.hasSnapshotWithinLifetime) {
      this.loadSnapshot().catch(logError)
    }

    // may or may not have a snapshot cached
    return this.cachedSnapshot
  }

  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ) {
    try {
      const snapshot = await this.getCurrentSnapshot()

      if (!snapshot) {
        // return an error to prevent "empty image buffer" warnings
        return callback(new Error('No Snapshot Cached'))
      }

      // Not currently resizing the image.
      // HomeKit does a good job of resizing and doesn't seem to care if it's not right
      callback(undefined, snapshot)
    } catch (e: any) {
      logError(`Error fetching snapshot for ${this.ringCamera.name}`)
      logError(e)
      callback(e)
    }
  }

  async prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ) {
    const start = Date.now()
    logInfo(`Preparing Live Stream for ${this.ringCamera.name}`)

    try {
      const liveCall = await this.ringCamera.startLiveCall(),
        session = new StreamingSessionWrapper(
          liveCall,
          request,
          this.ringCamera,
          start,
        )

      this.sessions[request.sessionID] = session

      logInfo(
        `Stream Prepared for ${this.ringCamera.name} (${getDurationSeconds(
          start,
        )}s)`,
      )

      callback(undefined, {
        audio: {
          port: await session.audioSplitter.portPromise,
          ssrc: session.audioSsrc,
          srtp_key: session.audioSrtp.srtpKey,
          srtp_salt: session.audioSrtp.srtpSalt,
        },
        video: {
          port: await session.videoSplitter.portPromise,
          ssrc: session.videoSsrc,
          srtp_key: session.videoSrtp.srtpKey,
          srtp_salt: session.videoSrtp.srtpSalt,
        },
      })
    } catch (e: any) {
      logError(
        `Failed to prepare stream for ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`,
      )
      logError(e)
      callback(e)
    }
  }

  async handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ) {
    const sessionID = request.sessionID,
      session = this.sessions[sessionID],
      requestType = request.type

    if (!session) {
      callback(new Error('Cannot find session for stream ' + sessionID))
      return
    }

    if (requestType === 'start') {
      logInfo(
        `Activating stream for ${this.ringCamera.name} (${getDurationSeconds(
          session.start,
        )}s)`,
      )
      try {
        await session.activate(request)
      } catch (e) {
        logError('Failed to activate stream')
        logError(e)
        callback(new Error('Failed to activate stream'))

        return
      }
      logInfo(
        `Streaming active for ${this.ringCamera.name} (${getDurationSeconds(
          session.start,
        )}s)`,
      )
    } else if (requestType === 'stop') {
      logInfo(`Stopped Live Stream for ${this.ringCamera.name}`)
      session.stop()
      delete this.sessions[sessionID]
    }

    callback()
  }
}
