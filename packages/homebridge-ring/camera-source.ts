import type { RingCamera } from 'ring-client-api'
import { hap } from './hap.ts'
import type { SrtpOptions } from '@homebridge/camera-utils'
import {
  defaultFfmpegPath,
  generateSrtpOptions,
  ReturnAudioTranscoder,
  RtpSplitter,
} from '@homebridge/camera-utils'
import type {
  CameraStreamingDelegate,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  StartStreamRequest,
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge'
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  H264Level,
  H264Profile,
  SRTPCryptoSuites,
} from 'homebridge'
import { logDebug, logError, logInfo } from 'ring-client-api/util'
import { debounceTime, delay, filter, take } from 'rxjs/operators'
import { interval, merge, of, Subject } from 'rxjs'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFile } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { getFfmpegPath } from 'ring-client-api/ffmpeg'
import {
  RtcpSenderInfo,
  RtcpSrPacket,
  RtpPacket,
  SrtpSession,
  SrtcpSession,
} from 'werift'
import type { StreamingSession } from 'ring-client-api/streaming/streaming-session'
import { SnapshotFrameBuffer } from './snapshot-frame-buffer.ts'
import { SnapshotH264FrameBuffer } from './snapshot-h264-frame-buffer.ts'

const __dirname = new URL('.', import.meta.url).pathname,
  mediaDirectory = path.join(__dirname.replace(/\/lib\/?$/, ''), 'media'),
  readFileAsync = promisify(readFile),
  cameraOfflinePath = path.join(mediaDirectory, 'camera-offline.jpg'),
  snapshotsBlockedPath = path.join(mediaDirectory, 'snapshots-blocked.jpg'),
  backgroundSnapshotTimeoutMs = 15000,
  initialSnapshotWaitMs = 6000,
  maxLiveSnapshotAgeMs = 5 * 60 * 1000

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

function captureLiveStreamSnapshots(
  streamingSession: StreamingSession,
  cameraName: string,
  onSnapshot: (snapshot: Buffer) => void,
) {
  const snapshotTranscoder: ChildProcessWithoutNullStreams = spawn(
      getFfmpegPath() || defaultFfmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-skip_frame',
        'nokey',
        '-f',
        'h264',
        '-i',
        'pipe:0',
        '-c:v',
        'mjpeg',
        '-fps_mode',
        'passthrough',
        '-f',
        'image2pipe',
        'pipe:1',
      ],
    ),
    frames = new SnapshotFrameBuffer(onSnapshot)
  let lastKeyFrameRequestAt = 0
  const h264Frames = new SnapshotH264FrameBuffer(() => {
    if (Date.now() - lastKeyFrameRequestAt >= 1000) {
      logDebug(`Discarded incomplete live video frame for ${cameraName}`)
      streamingSession.requestKeyFrame()
      lastKeyFrameRequestAt = Date.now()
    }
  })
  snapshotTranscoder.stdout.on('data', (chunk: Buffer) => {
    frames.append(chunk)
  })
  snapshotTranscoder.stderr.on('data', (message: Buffer) => {
    logDebug(`Live stream snapshot (${cameraName}): ${message}`)
  })
  snapshotTranscoder.on('error', logError)
  snapshotTranscoder.stdin.on('error', (error) => {
    if (!error.message.includes('EPIPE')) {
      logError(error)
    }
  })

  let backpressured = false
  snapshotTranscoder.stdin.on('drain', () => {
    backpressured = false
    if (!snapshotTranscoder.stdin.writableEnded) {
      streamingSession.requestKeyFrame()
    }
  })

  streamingSession.addSubscriptions(
    streamingSession.onVideoRtp.subscribe((rtp) => {
      if (backpressured || snapshotTranscoder.stdin.destroyed) {
        return
      }

      try {
        const frame = h264Frames.append(rtp)
        if (frame) {
          backpressured = !snapshotTranscoder.stdin.write(frame)
        }
      } catch (error) {
        logError(`Failed to process live stream video for ${cameraName}`)
        logError(error)
      }
    }),
  )
  streamingSession.onCallEnded.pipe(take(1)).subscribe(() => {
    snapshotTranscoder.stdin.end()
  })
}

class StreamingSessionWrapper {
  audioSsrc = hap.CameraController.generateSynchronisationSource()
  videoSsrc = hap.CameraController.generateSynchronisationSource()
  audioSrtp = generateSrtpOptions()
  videoSrtp = generateSrtpOptions()
  audioSplitter = new RtpSplitter()
  videoSplitter = new RtpSplitter()
  transcodedAudioSplitter = new RtpSplitter()

  public streamingSession
  public prepareStreamRequest
  public ringCamera
  public start
  private readonly onLiveStreamSnapshot?: (snapshot: Buffer) => void

  constructor(
    streamingSession: StreamingSession,
    prepareStreamRequest: PrepareStreamRequest,
    ringCamera: RingCamera,
    start: number,
    onLiveStreamSnapshot?: (snapshot: Buffer) => void,
  ) {
    this.streamingSession = streamingSession
    this.prepareStreamRequest = prepareStreamRequest
    this.ringCamera = ringCamera
    this.start = start
    this.onLiveStreamSnapshot = onLiveStreamSnapshot

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
      timestampIncrement =
        startStreamRequest.audio.sample_rate *
        startStreamRequest.audio.packet_time,
      audioSrtpSession = new SrtpSession(getSessionConfig(this.audioSrtp))

    let runningTimestamp: number

    this.transcodedAudioSplitter.addMessageHandler(({ message }) => {
      const rtp: RtpPacket | undefined = RtpPacket.deSerialize(message)

      // For some reason HAP uses RFC 3550 timestamps instead of following RTP Paylod
      // Format for Opus Speech and Audio Codec from RFC 7587 like everyone else.
      // This calculates and replaces the timestamps before forwarding to Homekit.
      if (!runningTimestamp) {
        runningTimestamp = rtp.header.timestamp
      }

      rtp.header.timestamp = runningTimestamp % 0xffffffff
      runningTimestamp += timestampIncrement

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

    const transcodingPromise = this.streamingSession.startTranscoding({
      input: ['-vn'],
      audio: [
        '-acodec',
        'libopus',
        '-application',
        'lowdelay',
        '-frame_duration',
        request.audio.packet_time.toString(),
        '-flags',
        '+global_header',
        '-ar',
        `${request.audio.sample_rate}k`,
        '-b:a',
        `${request.audio.max_bit_rate}k`,
        '-bufsize',
        `${request.audio.max_bit_rate * 4}k`,
        '-ac',
        `${request.audio.channel}`,
        '-payload_type',
        request.audio.pt,
        '-ssrc',
        this.audioSsrc,
        '-f',
        'rtp',
        `rtp://127.0.0.1:${await this.transcodedAudioSplitter.portPromise}`,
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
        } catch {
          // deSerialize will sometimes fail, but the errors can be ignored
        }

        return null
      }),
      returnAudioTranscoder = new ReturnAudioTranscoder({
        prepareStreamRequest: this.prepareStreamRequest,
        startStreamRequest: request,
        incomingAudioOptions: {
          ssrc: this.audioSsrc,
          rtcpPort: 0, // we don't care about rtcp for incoming audio
        },
        outputArgs: [
          '-acodec',
          'libopus',
          '-application',
          'lowdelay',
          '-frame_duration',
          '60',
          '-flags',
          '+global_header',
          '-ar',
          '48k',
          '-b:a',
          '48k',
          '-bufsize',
          '192k',
          '-ac',
          '2',
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

    if (this.onLiveStreamSnapshot) {
      let hasCachedSnapshot = false
      captureLiveStreamSnapshots(
        this.streamingSession,
        this.ringCamera.name,
        (snapshot) => {
          this.onLiveStreamSnapshot?.(snapshot)
          if (!hasCachedSnapshot) {
            hasCachedSnapshot = true
            logDebug(`Cached live stream snapshot for ${this.ringCamera.name}`)
          }
        },
      )
    }

    await transcodingPromise
  }

  stop() {
    this.audioSplitter.close()
    this.transcodedAudioSplitter.close()
    this.videoSplitter.close()
    this.streamingSession.stop()
  }
}

export class CameraSource implements CameraStreamingDelegate {
  public controller
  private sessions: { [sessionKey: string]: StreamingSessionWrapper } = {}
  private cachedSnapshot?: Buffer
  private liveStreamSnapshot?: Buffer
  private liveStreamSnapshotAt = 0
  private lastBackgroundSnapshotAttempt = 0
  private backgroundSnapshotPromise?: Promise<void>
  private backgroundSnapshotSession?: StreamingSession
  private backgroundSnapshotVersion = 0
  private lastBackgroundSnapshotSkipReason?: string
  private ringCamera
  private useLastLiveStreamSnapshot

  constructor(ringCamera: RingCamera, useLastLiveStreamSnapshot = false) {
    this.ringCamera = ringCamera
    this.useLastLiveStreamSnapshot = useLastLiveStreamSnapshot
    this.controller = new hap.CameraController({
      cameraStreamCount: 10,
      delegate: this,
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [1920, 1024, 30],
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
          ],
        },
      },
    })

    if (useLastLiveStreamSnapshot) {
      logInfo(
        `Live snapshot refresh enabled for ${ringCamera.name}: snapshots ${
          ringCamera.snapshotsAreBlocked ? 'blocked' : 'available'
        }, ${ringCamera.isOffline ? 'offline' : 'online'}, ${
          ringCamera.operatingOnBattery ? 'battery' : 'wired'
        }`,
      )
      if (!ringCamera.snapshotsAreBlocked || ringCamera.isOffline) {
        logDebug(`Waiting for blocked snapshot status for ${ringCamera.name}`)
      }
      ringCamera.onData
        .pipe(
          filter(() => ringCamera.snapshotsAreBlocked && !ringCamera.isOffline),
          take(1),
        )
        .subscribe(() => this.refreshBlockedSnapshotIfNeeded())
    }
  }

  private cacheLiveStreamSnapshot(snapshot: Buffer) {
    this.liveStreamSnapshot = snapshot
    this.liveStreamSnapshotAt = Date.now()
  }

  private async refreshBlockedSnapshot(version: number) {
    let liveCall: StreamingSession | undefined,
      timeout: ReturnType<typeof setTimeout> | undefined,
      expired = false

    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        expired = true
        reject(
          new Error(
            `Timed out refreshing snapshot for ${this.ringCamera.name}`,
          ),
        )
      }, backgroundSnapshotTimeoutMs)
    })

    try {
      logDebug(
        `Refreshing blocked snapshot for ${this.ringCamera.name} from live video`,
      )
      liveCall = await Promise.race([
        this.ringCamera.startLiveCall().then((call) => {
          if (expired || version !== this.backgroundSnapshotVersion) {
            call.stop()
            return undefined
          }
          return call
        }),
        timedOut,
      ])

      if (!liveCall) {
        return
      }

      const session = liveCall
      let capturedFrame = false
      this.backgroundSnapshotSession = session
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          session.onCallEnded.pipe(take(1)).subscribe(() => {
            reject(
              new Error(`Live snapshot call ended for ${this.ringCamera.name}`),
            )
          })
          captureLiveStreamSnapshots(
            session,
            this.ringCamera.name,
            (snapshot) => {
              if (
                !capturedFrame &&
                version === this.backgroundSnapshotVersion
              ) {
                capturedFrame = true
                this.cacheLiveStreamSnapshot(snapshot)
                logDebug(
                  `Refreshed blocked snapshot for ${this.ringCamera.name}`,
                )
                resolve()
              }
            },
          )
          session.requestKeyFrame()
        }),
        timedOut,
      ])
    } finally {
      expired = true
      clearTimeout(timeout)
      liveCall?.stop()
      if (this.backgroundSnapshotSession === liveCall) {
        this.backgroundSnapshotSession = undefined
      }
    }
  }

  private refreshBlockedSnapshotIfNeeded() {
    const refreshInterval = this.ringCamera.operatingOnBattery ? 60000 : 30000
    if (!this.useLastLiveStreamSnapshot) {
      return
    }

    const skipReason = this.ringCamera.isOffline
      ? 'camera offline'
      : !this.ringCamera.snapshotsAreBlocked
      ? 'snapshots available'
      : this.backgroundSnapshotPromise
      ? 'refresh already running'
      : Object.keys(this.sessions).length
      ? 'live stream active'
      : Date.now() - this.lastBackgroundSnapshotAttempt < refreshInterval
      ? 'rate limit'
      : Date.now() - this.liveStreamSnapshotAt < refreshInterval
      ? 'recent live frame'
      : undefined

    if (skipReason) {
      if (skipReason !== this.lastBackgroundSnapshotSkipReason) {
        logDebug(
          `Blocked snapshot refresh deferred for ${this.ringCamera.name}: ${skipReason}`,
        )
        this.lastBackgroundSnapshotSkipReason = skipReason
      }
      return
    }

    this.lastBackgroundSnapshotSkipReason = undefined
    this.lastBackgroundSnapshotAttempt = Date.now()
    const version = this.backgroundSnapshotVersion,
      refresh = this.refreshBlockedSnapshot(version).catch((error) => {
        if (version === this.backgroundSnapshotVersion) {
          logError(
            `Failed to refresh live snapshot for ${this.ringCamera.name}`,
          )
          logError(error)
        }
      })
    this.backgroundSnapshotPromise = refresh
    refresh
      .finally(() => {
        if (this.backgroundSnapshotPromise === refresh) {
          this.backgroundSnapshotPromise = undefined
        }
      })
      .catch(logError)
  }

  private hasCurrentLiveStreamSnapshot() {
    return (
      this.liveStreamSnapshot &&
      Date.now() - this.liveStreamSnapshotAt < maxLiveSnapshotAgeMs
    )
  }

  private async waitForInitialLiveStreamSnapshot() {
    if (
      !this.useLastLiveStreamSnapshot ||
      !this.ringCamera.snapshotsAreBlocked ||
      this.hasCurrentLiveStreamSnapshot() ||
      !this.backgroundSnapshotPromise
    ) {
      return
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.backgroundSnapshotPromise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, initialSnapshotWaitMs)
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  }

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
    } catch {
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
      if (this.useLastLiveStreamSnapshot) {
        this.refreshBlockedSnapshotIfNeeded()
        if (this.hasCurrentLiveStreamSnapshot()) {
          logDebug(`Used live stream snapshot for ${this.ringCamera.name}`)
          return this.liveStreamSnapshot
        }
      }

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
      let snapshot = await this.getCurrentSnapshot()
      if (
        this.useLastLiveStreamSnapshot &&
        this.ringCamera.snapshotsAreBlocked &&
        !this.ringCamera.isOffline
      ) {
        await this.waitForInitialLiveStreamSnapshot()
        if (this.hasCurrentLiveStreamSnapshot()) {
          snapshot = this.liveStreamSnapshot
        }
      }

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
      this.backgroundSnapshotVersion++
      this.backgroundSnapshotSession?.stop()
      const liveCall = await this.ringCamera.startLiveCall(),
        session = new StreamingSessionWrapper(
          liveCall,
          request,
          this.ringCamera,
          start,
          this.useLastLiveStreamSnapshot
            ? (snapshot) => {
                this.cacheLiveStreamSnapshot(snapshot)
              }
            : undefined,
        )

      this.sessions[request.sessionID] = session
      liveCall.onCallEnded.pipe(take(1)).subscribe(() => {
        if (this.sessions[request.sessionID] === session) {
          delete this.sessions[request.sessionID]
        }
      })

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
