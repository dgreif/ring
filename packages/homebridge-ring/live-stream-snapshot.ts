/**
 * Captures JPEGs from live video and manages the optional cached snapshot used
 * when Ring blocks its normal snapshot endpoint.
 */
import { defaultFfmpegPath } from '@homebridge/camera-utils'
import type { RingCamera } from 'ring-client-api'
import { getFfmpegPath } from 'ring-client-api/ffmpeg'
import { logDebug, logError, logInfo } from 'ring-client-api/util'
import type { StreamingSession } from 'ring-client-api/streaming/streaming-session'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { filter, take } from 'rxjs/operators'
import { SnapshotFrameBuffer } from './snapshot-frame-buffer.ts'
import { SnapshotH264FrameBuffer } from './snapshot-h264-frame-buffer.ts'

const backgroundSnapshotTimeoutMs = 15000,
  initialSnapshotWaitMs = 6000

export function captureLiveStreamSnapshot(
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

export class LiveStreamSnapshot {
  private readonly ringCamera: RingCamera
  private readonly hasActiveLiveStream: () => boolean
  private snapshot?: Buffer
  private snapshotAt = 0
  private lastRefreshAttempt = 0
  private refreshPromise?: Promise<void>
  private refreshSession?: StreamingSession
  private refreshVersion = 0
  private lastSkipReason?: string

  constructor(ringCamera: RingCamera, hasActiveLiveStream: () => boolean) {
    this.ringCamera = ringCamera
    this.hasActiveLiveStream = hasActiveLiveStream
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
      .subscribe(() => this.refreshIfNeeded())
  }

  cache(snapshot: Buffer) {
    this.snapshot = snapshot
    this.snapshotAt = Date.now()
  }

  getSnapshot() {
    return this.snapshot
  }

  cancelRefresh() {
    this.refreshVersion++
    this.refreshSession?.stop()
  }

  private async refresh(version: number) {
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
        this.ringCamera.startLiveCall({ audioEnabled: false }).then((call) => {
          if (expired || version !== this.refreshVersion) {
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
      this.refreshSession = session
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          session.onCallEnded.pipe(take(1)).subscribe(() => {
            reject(
              new Error(`Live snapshot call ended for ${this.ringCamera.name}`),
            )
          })
          captureLiveStreamSnapshot(
            session,
            this.ringCamera.name,
            (snapshot) => {
              if (!capturedFrame && version === this.refreshVersion) {
                capturedFrame = true
                this.cache(snapshot)
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
      if (this.refreshSession === liveCall) {
        this.refreshSession = undefined
      }
    }
  }

  refreshIfNeeded() {
    const refreshInterval = this.ringCamera.operatingOnBattery
        ? Math.max(60000, this.ringCamera.snapshotLifeTime)
        : 30000,
      skipReason = this.ringCamera.isOffline
        ? 'camera offline'
        : !this.ringCamera.snapshotsAreBlocked
        ? 'snapshots available'
        : this.refreshPromise
        ? 'refresh already running'
        : this.hasActiveLiveStream()
        ? 'live stream active'
        : Date.now() - this.lastRefreshAttempt < refreshInterval
        ? 'rate limit'
        : Date.now() - this.snapshotAt < refreshInterval
        ? 'recent live frame'
        : undefined

    if (skipReason) {
      if (skipReason !== this.lastSkipReason) {
        logDebug(
          `Blocked snapshot refresh deferred for ${this.ringCamera.name}: ${skipReason}`,
        )
        this.lastSkipReason = skipReason
      }
      return
    }

    this.lastSkipReason = undefined
    this.lastRefreshAttempt = Date.now()
    const version = this.refreshVersion,
      refresh = this.refresh(version).catch((error) => {
        if (version === this.refreshVersion) {
          logError(
            `Failed to refresh live snapshot for ${this.ringCamera.name}`,
          )
          logError(error)
        }
      })
    this.refreshPromise = refresh
    refresh
      .finally(() => {
        if (this.refreshPromise === refresh) {
          this.refreshPromise = undefined
        }
      })
      .catch(logError)
  }

  async waitForInitialSnapshot() {
    if (
      this.snapshot ||
      !this.ringCamera.snapshotsAreBlocked ||
      !this.refreshPromise
    ) {
      return
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        this.refreshPromise,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, initialSnapshotWaitMs)
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  }
}
