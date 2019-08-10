import { RingCamera, SipSession } from '../api'
import { hap, HAP } from './hap'
import Service = HAP.Service
import { bindProxyPorts } from './rtp-proxy'
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

function getDurationSeconds(start: number) {
  return (Date.now() - start) / 1000
}

export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []
  sessions: { [sessionKey: string]: SipSession } = {}

  constructor(private ringCamera: RingCamera, private logger: HAP.Log) {
    let options = {
      // proxy: true,
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
          [320, 180, 30]
        ],
        codec: {
          profiles: [0],
          levels: [0]
        }
      },
      audio: {
        codecs: [
          {
            type: 'AAC-eld',
            samplerate: 16
          }
        ]
      }
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

      const snapshot = await this.ringCamera.getSnapshot(true),
        duration = (Date.now() - start) / 1000
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
      this.logger.error(e)
      callback(e)
    }
  }

  handleCloseConnection(connectionID: any) {
    this.streamControllers.forEach(controller => {
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
            srtp_salt: audioSrtpSalt
          },
          video: {
            port: videoPort,
            srtp_key: videoSrtpKey,
            srtp_salt: videoSrtpSalt
          }
        } = request,
        sipSession = await this.ringCamera.createSipSession({
          audio: {
            srtpKey: audioSrtpKey,
            srtpSalt: audioSrtpSalt
          },
          video: {
            srtpKey: videoSrtpKey,
            srtpSalt: videoSrtpSalt
          }
        }),
        [rtpOptions, audioProxy, videoProxy] = await Promise.all([
          sipSession.start(),
          bindProxyPorts(audioPort, targetAddress, 'audio', sipSession),
          bindProxyPorts(videoPort, targetAddress, 'video', sipSession)
        ])

      this.sessions[hap.UUIDGen.unparse(sessionID)] = sipSession

      this.logger.info(
        `Waiting for stream data from ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`
      )
      const [audioSsrc, videoSsrc] = await Promise.all([
        audioProxy.ssrcPromise,
        videoProxy.ssrcPromise
      ])
      this.logger.info(
        `Received stream data from ${
          this.ringCamera.name
        } (${getDurationSeconds(start)}s)`
      )

      const currentAddress = ip.address()
      callback({
        address: {
          address: currentAddress,
          type: ip.isV4Format(currentAddress) ? 'v4' : 'v6'
        },
        audio: {
          port: audioProxy.localPort,
          ssrc: audioSsrc,
          srtp_key: rtpOptions.audio.srtpKey,
          srtp_salt: rtpOptions.audio.srtpSalt
        },
        video: {
          port: videoProxy.localPort,
          ssrc: videoSsrc,
          srtp_key: rtpOptions.video.srtpKey,
          srtp_salt: rtpOptions.video.srtpSalt
        }
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

  handleStreamRequest(request: any) {
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
