import { RingCamera } from '../api'
import { hap } from './hap'
import {
  doesFfmpegSupportCodec,
  encodeSrtpOptions,
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
import { logDebug, logError, logInfo } from '../api/util'
import { debounceTime, delay, take } from 'rxjs/operators'
import { interval, merge, of, Subject } from 'rxjs'
import { readFile } from 'fs'
import { promisify } from 'util'
import { getFfmpegPath } from '../api/ffmpeg'
import {
  RtcpSenderInfo,
  RtcpSrPacket,
  RtpPacket,
  SrtpSession,
  SrtcpSession,
} from 'werift'
import { StreamingSession } from '../api/streaming/streaming-session'

const readFileAsync = promisify(readFile),
  cameraOfflinePath = require.resolve('../../media/camera-offline.jpg'),
  snapshotsBlockedPath = require.resolve('../../media/snapshots-blocked.jpg')

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

  libfdkAacInstalledPromise = doesFfmpegSupportCodec(
    'libfdk_aac',
    getFfmpegPath()
  )
    .then((supported) => {
      if (!supported) {
        logError(
          'Streaming video only - found ffmpeg, but libfdk_aac is not installed. See https://github.com/dgreif/ring/wiki/FFmpeg for details.'
        )
      }
      return supported
    })
    .catch(() => {
      logError(
        'Streaming video only - ffmpeg was not found. See https://github.com/dgreif/ring/wiki/FFmpeg for details.'
      )
      return false
    })

  constructor(
    public liveCall: StreamingSession,
    public prepareStreamRequest: PrepareStreamRequest,
    public ringCamera: RingCamera,
    public start: number
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
    liveCall.addSubscriptions(
      merge(of(true).pipe(delay(15000)), onReturnPacketReceived)
        .pipe(debounceTime(5000))
        .subscribe(() => {
          logInfo(
            `Live stream for ${
              this.ringCamera.name
            } appears to be inactive. (${getDurationSeconds(start)}s)`
          )
          liveCall.stop()
        })
    )

    // Periodically send a blank RTCP packet to the HomeKit video port
    // Without this, HomeKit assumes the stream is dead after 30 second and sends a stop request
    liveCall.addSubscriptions(
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
      })
    )
  }

  async activate(request: StartStreamRequest) {
    let sentVideo = false
    const {
        targetAddress,
        audio: {
          port: audioPort,
          srtp_key: remoteAudioSrtpKey,
          srtp_salt: remoteAudioSrtpSalt,
        },
        video: { port: videoPort },
      } = this.prepareStreamRequest,
      // use to encrypt Ring video to HomeKit
      videoSrtpSession = new SrtpSession(getSessionConfig(this.videoSrtp))

    // Set up packet forwarding for video stream
    this.liveCall.addSubscriptions(
      this.liveCall.onVideoRtp.subscribe(({ header, payload }) => {
        header.ssrc = this.videoSsrc
        header.payloadType = request.video.pt

        const encryptedPacket = videoSrtpSession.encrypt(payload, header)

        if (!sentVideo) {
          sentVideo = true
          logInfo(
            `Received stream data from ${
              this.ringCamera.name
            } (${getDurationSeconds(this.start)}s)`
          )
        }

        this.videoSplitter
          .send(encryptedPacket, {
            port: videoPort,
            address: targetAddress,
          })
          .catch(logError)
      })
    )

    const shouldTranscodeAudio = await this.libfdkAacInstalledPromise
    if (!shouldTranscodeAudio) {
      return this.liveCall.activate()
    }

    const transcodingPromise = this.liveCall.startTranscoding({
      input: ['-vn'],
      audio: [
        '-map',
        '0:a',

        // OPUS specific - it works, but audio is very choppy
        // '-acodec',
        // 'libopus',
        // '-vbr',
        // 'on',
        // '-frame_duration',
        // 20,
        // '-application',
        // 'lowdelay',

        // AAC-eld specific
        '-acodec',
        'libfdk_aac',
        '-profile:a',
        'aac_eld',

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
        '-srtp_out_suite',
        'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params',
        encodeSrtpOptions(this.audioSrtp),
        `srtp://${targetAddress}:${audioPort}?pkt_size=188`,
      ],
      video: false,
      output: [],
    })

    let cameraSpeakerActive = false
    // used to decrypt return audio from HomeKit to Ring
    const remoteAudioSrtpOptions: SrtpOptions = {
        srtpKey: remoteAudioSrtpKey,
        srtpSalt: remoteAudioSrtpSalt,
      },
      audioSrtpSession = new SrtpSession(
        getSessionConfig(remoteAudioSrtpOptions)
      ),
      returnAudioTranscodedSplitter = new RtpSplitter(({ message }) => {
        if (!cameraSpeakerActive) {
          cameraSpeakerActive = true
          this.liveCall.activateCameraSpeaker().catch(logError)
        }

        // decrypt the message
        try {
          const rtp = RtpPacket.deSerialize(message)
          rtp.payload = audioSrtpSession.decrypt(rtp.payload)

          // send to Ring - werift will handle encryption and other header params
          this.liveCall.sendAudioPacket(rtp)
        } catch (_) {
          // deSerialize will sometimes fail, but the errors can be ignored
        }

        return null
      }),
      returnAudioTranscoder = new ReturnAudioTranscoder({
        prepareStreamRequest: this.prepareStreamRequest,
        incomingAudioOptions: {
          ssrc: this.audioSsrc,
          rtcpPort: 0, // we don't care about rtcp for incoming audio
        },
        outputArgs: [
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

    this.liveCall.onCallEnded.pipe(take(1)).subscribe(() => {
      returnAudioTranscoder.stop()
      returnAudioTranscodedSplitter.close()
    })

    await returnAudioTranscoder.start()
    await transcodingPromise
  }

  stop() {
    this.audioSplitter.close()
    this.videoSplitter.close()
    this.liveCall.stop()
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
        codecs: [
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

  constructor(private ringCamera: RingCamera) {}

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
      }`
    )

    try {
      const previousSnapshot = this.cachedSnapshot,
        newSnapshot = await this.ringCamera.getSnapshot({ uuid: imageUuid })
      this.cachedSnapshot = newSnapshot

      if (previousSnapshot !== newSnapshot) {
        // Keep the snapshots in cache 2 minutes longer than their lifetime
        // This allows users on LTE with wired camera to get snapshots each 60 second pull even though the cached snapshot is out of date
        setTimeout(() => {
          if (this.cachedSnapshot === newSnapshot) {
            this.cachedSnapshot = undefined
          }
        }, this.ringCamera.snapshotLifeTime + 2 * 60 * 1000)
      }

      logDebug(
        `Snapshot cached for ${this.ringCamera.name}${
          imageUuid ? ' by uuid' : ''
        } (${getDurationSeconds(start)}s)`
      )
    } catch (e) {
      this.cachedSnapshot = undefined
      logDebug(
        `Failed to cache snapshot for ${
          this.ringCamera.name
        } (${getDurationSeconds(
          start
        )}s), The camera currently reports that it is ${
          this.ringCamera.isOffline ? 'offline' : 'online'
        }`
      )
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
      } for ${this.ringCamera.name}`
    )

    if (!this.ringCamera.hasSnapshotWithinLifetime) {
      this.loadSnapshot().catch(logError)
    }

    // may or may not have a snapshot cached
    return this.cachedSnapshot
  }

  async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback
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
    callback: PrepareStreamCallback
  ) {
    const start = Date.now()
    logInfo(`Preparing Live Stream for ${this.ringCamera.name}`)

    try {
      const liveCall = await this.ringCamera.startLiveCall(),
        session = new StreamingSessionWrapper(
          liveCall,
          request,
          this.ringCamera,
          start
        )

      this.sessions[request.sessionID] = session

      logInfo(
        `Stream Prepared for ${this.ringCamera.name} (${getDurationSeconds(
          start
        )}s)`
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
        } (${getDurationSeconds(start)}s)`
      )
      logError(e)
      callback(e)
    }
  }

  async handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback
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
          session.start
        )}s)`
      )
      await session.activate(request)
      logInfo(
        `Streaming active for ${this.ringCamera.name} (${getDurationSeconds(
          session.start
        )}s)`
      )
    } else if (requestType === 'stop') {
      logInfo(`Stopped Live Stream for ${this.ringCamera.name}`)
      session.stop()
      delete this.sessions[sessionID]
    }

    callback()
  }
}
