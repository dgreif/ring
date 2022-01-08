import { RingCamera, SipSession } from '../api'
import { hap } from './hap'
import {
  doesFfmpegSupportCodec,
  encodeSrtpOptions,
  getDefaultIpAddress,
  getSsrc,
  ReturnAudioTranscoder,
  RtpSplitter,
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
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge'
import { logDebug, logError, logInfo } from '../api/util'
import { debounceTime, delay, filter, map, take } from 'rxjs/operators'
import { firstValueFrom, merge, noop, of, Subject } from 'rxjs'
import { readFile } from 'fs'
import { promisify } from 'util'
import { isStunMessage } from '../api/rtp-utils'
import { getFfmpegPath } from '../api/ffmpeg'

const readFileAsync = promisify(readFile),
  cameraOfflinePath = require.resolve('../../media/camera-offline.jpg'),
  snapshotsBlockedPath = require.resolve('../../media/snapshots-blocked.jpg')

function getDurationSeconds(start: number) {
  return (Date.now() - start) / 1000
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
  private sessions: { [sessionKey: string]: SipSession } = {}
  private cachedSnapshot?: Buffer

  constructor(private ringCamera: RingCamera) {}

  private previousLoadSnapshotPromise?: Promise<any>
  async loadSnapshot() {
    // cache a promise of the snapshot load
    // This prevents multiple concurrent requests for snapshot from pilling up and creating lots of logs
    if (this.previousLoadSnapshotPromise) {
      return this.previousLoadSnapshotPromise
    }

    this.previousLoadSnapshotPromise = this.loadAndCacheSnapshot()

    try {
      await this.previousLoadSnapshotPromise
    } catch (_) {
      // ignore errors
    } finally {
      // clear so another request can be made
      this.previousLoadSnapshotPromise = undefined
    }
  }

  private async loadAndCacheSnapshot() {
    const start = Date.now()
    logDebug(`Loading new snapshot into cache for ${this.ringCamera.name}`)

    try {
      const previousSnapshot = this.cachedSnapshot,
        newSnapshot = await this.ringCamera.getSnapshot()
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
        `Snapshot cached for ${this.ringCamera.name} (${getDurationSeconds(
          start
        )}s)`
      )
    } catch (e) {
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
      const {
          sessionID,
          targetAddress,
          audio: {
            port: audioPort,
            srtp_key: audioSrtpKey,
            srtp_salt: audioSrtpSalt,
          },
          video: {
            port: videoPort,
            srtp_key: videoSrtpKey,
            srtp_salt: videoSrtpSalt,
          },
        } = request,
        ffmpegPath = getFfmpegPath(),
        [sipSession, libfdkAacInstalled] = await Promise.all([
          this.ringCamera.createSipSession({
            audio: {
              srtpKey: audioSrtpKey,
              srtpSalt: audioSrtpSalt,
            },
            video: {
              srtpKey: videoSrtpKey,
              srtpSalt: videoSrtpSalt,
            },
            skipFfmpegCheck: true,
          }),
          doesFfmpegSupportCodec('libfdk_aac', ffmpegPath)
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
            }),
        ]),
        onReturnPacketReceived = new Subject()

      sipSession.addSubscriptions(
        merge(of(true).pipe(delay(15000)), onReturnPacketReceived)
          .pipe(debounceTime(5000))
          .subscribe(() => {
            logInfo(
              `Live stream for ${
                this.ringCamera.name
              } appears to be inactive. (${getDurationSeconds(start)}s)`
            )
            sipSession.stop()
          })
      )

      this.sessions[sessionID] = sipSession

      const audioSsrc = hap.CameraController.generateSynchronisationSource(),
        incomingAudioRtcpPort = await sipSession.reservePort(),
        videoSsrcPromise = firstValueFrom(
          sipSession.videoSplitter.onMessage.pipe(
            filter(({ info }) => info.address !== targetAddress), // Ignore return packets from HomeKit
            map((m) => getSsrc(m.message)),
            filter((ssrc): ssrc is number => ssrc !== null)
          )
        ).catch(() => 0),
        ringRtpDescription = await sipSession.start(
          libfdkAacInstalled
            ? {
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
                  1,
                  '-ar',
                  '16k',
                  '-b:a',
                  '24k',
                  '-bufsize',
                  '24k',
                  '-payload_type',
                  110,
                  '-ssrc',
                  audioSsrc,
                  '-f',
                  'rtp',
                  '-srtp_out_suite',
                  'AES_CM_128_HMAC_SHA1_80',
                  '-srtp_out_params',
                  encodeSrtpOptions(sipSession.rtpOptions.audio),
                  `srtp://${targetAddress}:${audioPort}?localrtcpport=${incomingAudioRtcpPort}&pkt_size=188`,
                ],
                video: false,
                output: [],
              }
            : undefined
        )

      let videoPacketReceived = false
      sipSession.videoSplitter.addMessageHandler(
        ({ info, message, isRtpMessage }) => {
          if (info.address === targetAddress) {
            // return packet from HomeKit
            onReturnPacketReceived.next(null)

            if (!isRtpMessage) {
              // Only need to handle RTCP packets.  We really shouldn't receive RTP, but check just in case
              sipSession.videoRtcpSplitter
                .send(message, {
                  port: ringRtpDescription.video.rtcpPort,
                  address: ringRtpDescription.address,
                })
                .catch(logError)
            }

            // don't need to forward it along from the RTP splitter since it's only RTCP we care about
            return null
          }

          if (isStunMessage(message) || !isRtpMessage) {
            // we don't need to forward stun messages to HomeKit since they are for connection establishment purposes only
            // if not rtp, probably rtcp which will be handled from rtcp splitter
            return null
          }

          if (!videoPacketReceived) {
            videoPacketReceived = true
            logInfo(
              `Received stream data from ${
                this.ringCamera.name
              } (${getDurationSeconds(start)}s)`
            )
          }

          return {
            port: videoPort,
            address: targetAddress,
          }
        }
      )
      sipSession.videoRtcpSplitter.addMessageHandler(
        ({ message, info, isRtpMessage }) => {
          // for ICE connections, Rtcp splitter is the same as Rtp splitter, so we need to filter other messages out
          if (
            isStunMessage(message) ||
            isRtpMessage ||
            info.address === targetAddress
          ) {
            return null
          }

          sipSession.videoSplitter
            .send(message, {
              port: videoPort,
              address: targetAddress,
            })
            .catch(logError)
          return null
        }
      )

      let returnAudioPort: number | null = null
      if (libfdkAacInstalled) {
        let cameraSpeakerActive = false
        const ringAudioLocation = {
            address: ringRtpDescription.address,
            port: ringRtpDescription.audio.port,
          },
          returnAudioTranscodedSplitter = new RtpSplitter((description) => {
            if (!cameraSpeakerActive) {
              cameraSpeakerActive = true
              sipSession.activateCameraSpeaker().catch(logError)
            }

            sipSession.audioSplitter
              .send(description.message, ringAudioLocation)
              .catch(logError)

            return null
          }),
          returnAudioTranscoder = new ReturnAudioTranscoder({
            prepareStreamRequest: request,
            incomingAudioOptions: {
              ssrc: audioSsrc,
              rtcpPort: incomingAudioRtcpPort,
            },
            outputArgs: [
              '-acodec',
              'pcm_mulaw',
              '-flags',
              '+global_header',
              '-ac',
              1,
              '-ar',
              '8k',
              '-f',
              'rtp',
              '-srtp_out_suite',
              'AES_CM_128_HMAC_SHA1_80',
              '-srtp_out_params',
              encodeSrtpOptions(sipSession.rtpOptions.audio),
              `srtp://127.0.0.1:${await returnAudioTranscodedSplitter.portPromise}?pkt_size=188`,
            ],
            ffmpegPath,
            logger: {
              info: logDebug,
              error: logError,
            },
            logLabel: `Return Audio (${this.ringCamera.name})`,
          })

        sipSession.onCallEnded.pipe(take(1)).subscribe(() => {
          returnAudioTranscoder.stop()
          returnAudioTranscodedSplitter.close()
        })

        returnAudioPort = await returnAudioTranscoder.start()
      }

      let videoSsrc = ringRtpDescription.video.ssrc
      if (videoSsrc) {
        // Server supported ICE, which means response SDP included SSRC
        logInfo(
          `Stream Prepared for ${this.ringCamera.name} (${getDurationSeconds(
            start
          )}s)`
        )
      } else {
        // Server uses RTP latching.  Need to wait for first packet to determine SSRC
        // NOTE: we could avoid this if we want to decrypt/re-encrypt each packets with a new SSRC
        logInfo(
          `Waiting for stream data from ${
            this.ringCamera.name
          } (${getDurationSeconds(start)}s)`
        )
        videoSsrc = await videoSsrcPromise
      }

      if (!videoSsrc) {
        // failed to get video packet
        logInfo(
          `Stream was closed before it was ready for ${
            this.ringCamera.name
          } (${getDurationSeconds(start)}s)`
        )
        return callback(undefined)
      }

      callback(undefined, {
        // SOMEDAY: remove address as it is not needed after homebridge 1.1.3
        address: await getDefaultIpAddress(request.addressVersion === 'ipv6'),
        audio: {
          // if audio isn't supported, pipe rtcp to incomingAudioRtcpPort which will not actually be bound
          port: returnAudioPort || incomingAudioRtcpPort,
          ssrc: audioSsrc,
          srtp_key: audioSrtpKey,
          srtp_salt: audioSrtpSalt,
        },
        video: {
          port: await sipSession.videoSplitter.portPromise,
          ssrc: videoSsrc,
          srtp_key: ringRtpDescription.video.srtpKey,
          srtp_salt: ringRtpDescription.video.srtpSalt,
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

  handleStreamRequest(
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
      logInfo(`Streaming active for ${this.ringCamera.name}`)
      // sip/rtp already started at this point, but request a key frame so that HomeKit for sure has one
      session.requestKeyFrame().catch(noop)
    } else if (requestType === 'stop') {
      logInfo(`Stopped Live Stream for ${this.ringCamera.name}`)
      session.stop()
      delete this.sessions[sessionID]
    }

    callback()
  }
}
