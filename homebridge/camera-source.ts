import { RingCamera, SipSession } from '../api'
import { hap, HAP } from './hap'
import Service = HAP.Service
import {
  generateSsrc,
  bindProxyPorts,
  doesFfmpegSupportCodec,
  getSrtpValue,
} from '../api/rtp-utils'
const ip = require('ip')

interface HapRtpConfig {
  port: number
  proxy_rtp: number
  proxy_rtcp: number
  srtp_key: Buffer
  srtp_salt: Buffer
}

interface PrepareStreamRequest {
  sessionID: Buffer
  targetAddress: string
  video: HapRtpConfig
  audio: HapRtpConfig
}

interface HandleStreamRequest {
  sessionID: Buffer
  type: 'start' | 'stop' | 'reconfigure'
  video: {
    profile: number
    level: number
    width: number
    height: number
    fps: number
    ssrc: number
    pt: number
    max_bit_rate: number
    rtcp_interval: number
    mtu: number
  }
  audio: {
    codec: 'AAC-eld' | string
    channel: number
    bit_rate: number
    sample_rate: number
    packet_time: number
    pt: number
    ssrc: number
    max_bit_rate: number
    rtcp_interval: number
    comfort_pt: number
  }
}

function getDurationSeconds(start: number) {
  return (Date.now() - start) / 1000
}

export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []
  sessions: { [sessionKey: string]: SipSession } = {}

  constructor(private ringCamera: RingCamera, private logger: HAP.Log) {
    const options = {
      srtp: true,
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
          profiles: [0],
          levels: [0],
        },
      },
      audio: {
        codecs: [
          {
            type: 'AAC-eld',
            samplerate: 16,
          },
        ],
      },
    }

    this.services.push(new hap.Service.CameraControl())

    for (let i = 0; i < 2; i++) {
      const streamController = new hap.StreamController(i, options, this)

      this.services.push(streamController.service)
      this.streamControllers.push(streamController)
    }
  }

  async handleSnapshotRequest(
    request: { width: number; height: number },
    callback: (err?: Error, snapshot?: Buffer) => void
  ) {
    const start = Date.now()
    try {
      this.logger.info(`Snapshot for ${this.ringCamera.name} Requested`)

      const snapshot = await this.ringCamera.getSnapshot(true)
      this.logger.info(
        `Snapshot for ${this.ringCamera.name} Received (${getDurationSeconds(
          start
        )}s)`
      )
      // Not currently resizing the image.
      // HomeKit does a good job of resizing and doesn't seem to care if it's not right
      callback(undefined, snapshot)
    } catch (e) {
      this.logger.error(
        `Failed to retrieve snapshot for ${
          this.ringCamera.name
        } (${getDurationSeconds(
          start
        )}s).  The camera currently reports that is it ${
          this.ringCamera.isOffline ? 'offline' : 'online'
        }`
      )

      if (!this.ringCamera.isOffline) {
        this.logger.error(
          this.ringCamera.name +
            ' camera appears to be unable to upload snapshots.  This usually requires a physical restart of the camera.  Please turn off power to this camera by removing its battery or turning off the breaker for the circuit it is wired to.  Once power is cycled, snapshots should start working again.'
        )
      }

      this.logger.error(e)
      callback(e)
    }
  }

  handleCloseConnection(connectionID: any) {
    this.streamControllers.forEach((controller) => {
      controller.handleCloseConnection(connectionID)
    })
  }

  async prepareStream(
    request: PrepareStreamRequest,
    callback: (response: any) => void
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
        audioSsrc = generateSsrc(),
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

      this.sessions[hap.UUIDGen.unparse(sessionID)] = sipSession

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
      callback({
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

  handleStreamRequest(request: HandleStreamRequest) {
    const sessionID = request.sessionID,
      sessionKey = hap.UUIDGen.unparse(sessionID),
      session = this.sessions[sessionKey],
      requestType = request.type

    if (!session) {
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
  }
}
