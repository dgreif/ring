import { RingCamera, SipSession } from '../api'
import { hap } from './hap'
import {
  bindProxyPorts,
  doesFfmpegSupportCodec,
  getSrtpValue,
} from '../api/rtp-utils'
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraStreamingDelegate,
  H264Level,
  H264Profile,
  Logging,
  PrepareStreamCallback,
  PrepareStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StreamingRequest,
  StreamRequestCallback,
} from 'homebridge'
import { logDebug } from '../api/util'

const ip = require('ip')

function getDurationSeconds(start: number) {
  return (Date.now() - start) / 1000
}

export class CameraSource implements CameraStreamingDelegate {
  public controller = new hap.CameraController({
    cameraStreamCount: 2,
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
  sessions: { [sessionKey: string]: SipSession } = {}

  constructor(private ringCamera: RingCamera, private logger: Logging) {
    void this.loadSnapshot()
  }

  private lastSnapshot?: Buffer

  async loadSnapshot() {
    const start = Date.now()
    logDebug(`Loading new snapshot into cache for ${this.ringCamera.name}`)

    try {
      this.lastSnapshot = await this.ringCamera.getSnapshot(true)

      logDebug(
        `Snapshot cached for ${this.ringCamera.name} (${getDurationSeconds(
          start
        )}s)`
      )
    } catch (e) {
      this.logger.error(
        `Failed to cache snapshot for ${
          this.ringCamera.name
        } (${getDurationSeconds(
          start
        )}s), The camera currently reports that is it ${
          this.ringCamera.isOffline ? 'offline' : 'online'
        }`
      )

      if (!this.ringCamera.isOffline) {
        this.logger.error(
          this.ringCamera.name +
            ' camera appears to be unable to upload snapshots.  This can happen when your Ring Modes settings prevent motion detection or live view, which also prevents snapshots.  If Modes are not blocking snapshots, this can also happen if the camera has gotten into a bad state, which requires a physical restart of the camera.  If this happens, you will also not be able to retrieve snapshots via the Ring app for this camera.  In that case, please turn off power to this camera by removing its battery or turning off the breaker for the circuit it is wired to.  Once power is cycled, snapshots should start working again.'
        )
      }
    }
  }

  handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback
  ) {
    logDebug(
      `${
        this.lastSnapshot ? 'Used cached snapshot' : 'No snapshot cached'
      } for ${this.ringCamera.name}`
    )

    // Not currently resizing the image.
    // HomeKit does a good job of resizing and doesn't seem to care if it's not right
    callback(undefined, this.lastSnapshot)
    void this.loadSnapshot()
  }

  async prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback
  ) {
    const start = Date.now()
    this.logger.info(`Preparing Live Stream for ${this.ringCamera.name}`)

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
          }),
          doesFfmpegSupportCodec('libfdk_aac')
            .then((supported) => {
              if (!supported) {
                this.logger.error(
                  'Streaming video only - found ffmpeg, but libfdk_aac is not installed. See https://github.com/dgreif/ring/wiki/FFmpeg for details.'
                )
              }
              return supported
            })
            .catch(() => {
              this.logger.error(
                'Streaming video only - ffmpeg was not found. See https://github.com/dgreif/ring/wiki/FFmpeg for details.'
              )
              return false
            }),
        ]),
        audioSsrc = hap.CameraController.generateSynchronisationSource(),
        proxyAudioPort = await sipSession.reservePort(),
        [rtpOptions, videoProxy] = await Promise.all([
          sipSession.start(
            libfdkAacInstalled
              ? {
                  audio: [
                    '-map',
                    '0:0',

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
                    getSrtpValue({
                      srtpKey: audioSrtpKey,
                      srtpSalt: audioSrtpSalt,
                    }),
                    `srtp://${targetAddress}:${audioPort}?localrtcpport=${proxyAudioPort}&pkt_size=188`,
                  ],
                  video: false,
                  output: [],
                }
              : undefined
          ),
          bindProxyPorts(videoPort, targetAddress, 'video', sipSession),
        ])

      this.sessions[hap.uuid.unparse(sessionID)] = sipSession

      this.logger.info(
        `Waiting for stream data from ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`
      )
      const videoSsrc = await videoProxy.ssrcPromise

      this.logger.info(
        `Received stream data from ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`
      )

      const currentAddress = ip.address()
      callback(undefined, {
        address: {
          address: currentAddress,
          type: ip.isV4Format(currentAddress) ? 'v4' : 'v6',
        },
        audio: {
          port: proxyAudioPort,
          ssrc: audioSsrc,
          srtp_key: audioSrtpKey,
          srtp_salt: audioSrtpSalt,
        },
        video: {
          port: videoProxy.localPort,
          ssrc: videoSsrc,
          srtp_key: rtpOptions.video.srtpKey,
          srtp_salt: rtpOptions.video.srtpSalt,
        },
      })
    } catch (e) {
      this.logger.error(
        `Failed to prepare stream for ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`
      )
      this.logger.error(e)
    }
  }

  handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback
  ) {
    const sessionID = request.sessionID,
      sessionKey = hap.uuid.unparse(sessionID),
      session = this.sessions[sessionKey],
      requestType = request.type

    if (!session) {
      callback(new Error('Cannot find session for stream ' + sessionID))
      return
    }

    if (requestType === 'start') {
      this.logger.info(`Streaming active for ${this.ringCamera.name}`)
      // sip/rtp already started at this point
    } else if (requestType === 'stop') {
      this.logger.info(`Stopped Live Stream for ${this.ringCamera.name}`)
      session.stop()
      delete this.sessions[sessionKey]
    }

    callback()
  }
}
