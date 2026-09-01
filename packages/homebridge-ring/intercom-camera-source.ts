// Adapted copy of camera-source.ts, for the Ring Intercom ONLY.
//
// Copied rather than subclassed because the class that needs changing
// (StreamingSessionWrapper) is not exported, and because touching the original would
// put streaming for real Ring cameras at risk, which works today.
//
// THE ONE SUBSTANTIVE DIFFERENCE: the intercom has no camera. Ring does send audio
// (measured: 210 packets in 15s) but no valid H.264 arrives on the video channel.
// The original forwards those packets to HomeKit as-is, and HomeKit — receiving
// something it cannot parse on the video track — tears down the ENTIRE session,
// taking the audio with it.
// So Ring's video is NOT forwarded here: ffmpeg encodes a real H.264 track from the
// still image and sends it over SRTP, while the audio takes its normal path.
import { hap } from './hap.ts'
import { spawn, type ChildProcess } from 'child_process'
import type { IntercomCamera } from './intercom-camera.ts'
import type { SrtpOptions } from '@homebridge/camera-utils'
import {
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
import type { StreamingSession } from 'ring-client-api/streaming/streaming-session'
import path from 'node:path'

const __dirname = new URL('.', import.meta.url).pathname,
  mediaDirectory = path.join(__dirname.replace(/\/lib\/?$/, ''), 'media'),
  readFileAsync = promisify(readFile),
  cameraOfflinePath = path.join(mediaDirectory, 'camera-offline.jpg'),
  snapshotsBlockedPath = path.join(mediaDirectory, 'snapshots-blocked.jpg')

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

class IntercomStreamingSessionWrapper {
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
  private videoFfmpeg?: ChildProcess
  public start

  constructor(
    streamingSession: StreamingSession,
    prepareStreamRequest: PrepareStreamRequest,
    ringCamera: IntercomCamera,
    start: number,
  ) {
    this.streamingSession = streamingSession
    this.prepareStreamRequest = prepareStreamRequest
    this.ringCamera = ringCamera
    this.start = start

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
    // No SRTP session for Ring's video here, unlike camera-source: that video is
    // never forwarded, so there is nothing of Ring's to encrypt. ffmpeg encrypts the
    // still-image track itself, via -srtp_out_params below.
    const {
      targetAddress,
      video: { port: videoPort },
    } = this.prepareStreamRequest

    // ── Open the intercom microphone ──────────────────────────────────────────
    // THIS is the piece that was missing in order to hear anything. The original only
    // sends `camera_options { stealth_mode: false }` once HomeKit starts returning
    // audio, i.e. when the user presses the microphone to talk. An intercom starts in
    // stealth mode, so until that moment it transmits SILENCE.
    // Measured: without this, blocks sit at -92 dB (digital silence) even during a
    // real call; with it they land between -42 and -79 dB, i.e. actual sound.
    this.streamingSession.activateCameraSpeaker()

    // ── Synthetic video ───────────────────────────────────────────────────────
    // onVideoRtp is NOT forwarded: what Ring sends on that channel for an intercom is
    // not H.264, and HomeKit drops the whole session on receiving it, taking the audio
    // down with it. Instead, ffmpeg encodes the still image as real H.264 and sends it
    // over SRTP straight to the iPhone.
    //
    // WARNING: 10 fps, NO lower. Dropping to 5 to save CPU (6.2% -> 4.9%) was tried and
    // HomeKit began cutting the session after a few seconds: audio fell from ~25 KiB to
    // 2 KiB per session and nothing could be heard. The optimization that DOES work is
    // reducing frame SIZE: at 320x240 the encoder drops to 1.5%.
    const snapshotFile = this.ringCamera.getSnapshotPath(),
      srtpParams = Buffer.concat([
        this.videoSrtp.srtpKey,
        this.videoSrtp.srtpSalt,
      ]).toString('base64'),
      ffmpegArgs = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-re',
        '-loop',
        '1',
        '-i',
        snapshotFile,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'stillimage',
        '-pix_fmt',
        'yuv420p',
        '-profile:v',
        'baseline',
        '-level',
        '3.1',
        '-r',
        '10',
        '-g',
        '30',
        '-b:v',
        '299k',
        '-bufsize',
        '299k',
        '-payload_type',
        String(request.video.pt),
        '-ssrc',
        String(this.videoSsrc),
        '-f',
        'rtp',
        '-srtp_out_suite',
        'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params',
        srtpParams,
        `srtp://${targetAddress}:${videoPort}?rtcpport=${videoPort}&pkt_size=1128`,
      ]

    this.videoFfmpeg = spawn(this.ringCamera.ffmpegPath, ffmpegArgs)
    this.videoFfmpeg.stderr?.on('data', (d: Buffer) =>
      logDebug(`[intercom video] ${d.toString().trim()}`),
    )
    this.videoFfmpeg.on('error', (e: Error) =>
      logError(`Intercom video ffmpeg failed: ${e.message}`),
    )
    logInfo(
      `Sent still image to HomeKit for ${
        this.ringCamera.name
      } (${getDurationSeconds(this.start)}s)`,
    )

    const transcodingPromise = this.streamingSession.startTranscoding({
      // `-fflags +genpts` plus the async resample: intercom audio arrives with
      // inconsistent timestamps and ffmpeg warns "Queue input is backward in time".
      // With timestamps that go backwards, HomeKit discards the audio even though the
      // packets themselves arrive fine.
      input: [
        '-vn',
        '-fflags',
        '+genpts+discardcorrupt',
        '-use_wallclock_as_timestamps',
        '1',
      ],
      audio: [
        // volume boosts the audio coming from the intercom (its mic is quiet) and
        // alimiter keeps that boost from clipping on peaks, which is where the
        // consonants live.
        '-af',
        `aresample=async=1:first_pts=0,volume=${this.ringCamera.micGainDb}dB,alimiter=limit=0.95`,
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
          // Gain for the voice going out to the intercom speaker. With a limiter:
          // boosting raw distorts exactly on the peaks, which carry the consonants
          // that make a word intelligible.
          '-af',
          `volume=${this.ringCamera.speakerGainDb}dB,alimiter=limit=0.95`,
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
    await transcodingPromise
  }

  stop() {
    if (this.videoFfmpeg) {
      this.videoFfmpeg.kill('SIGKILL')
      this.videoFfmpeg = undefined
    }
    this.audioSplitter.close()
    this.transcodedAudioSplitter.close()
    this.videoSplitter.close()
    this.streamingSession.stop()
  }
}

export class IntercomCameraSource implements CameraStreamingDelegate {
  public controller
  private sessions: { [sessionKey: string]: IntercomStreamingSessionWrapper } =
    {}
  private cachedSnapshot?: Buffer
  private ringCamera

  constructor(ringCamera: IntercomCamera) {
    this.ringCamera = ringCamera
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
        // The intercom has no camera: the image is always the same one, and there is
        // no snapshot uuid to ask Ring for.
        newSnapshot = await this.ringCamera.getSnapshot()
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
        session = new IntercomStreamingSessionWrapper(
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
