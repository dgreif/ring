import { RingCamera, RtpOptions, SipSession } from '../api'
import { hap, HAP } from './hap'
import { bindProxyPorts } from './rtp-utils'
import { ReplaySubject } from 'rxjs'
import { take } from 'rxjs/operators'
import { v4 as getPublicIp } from 'public-ip'
import Service = HAP.Service

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

export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []
  sessions: {
    [sessionKey: string]: {
      sipSession: SipSession
      stop: () => any
    }
  } = {}

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
    try {
      this.logger.info(`Snapshot Requested for ${this.ringCamera.name}`)
      const snapshot = await this.ringCamera.getSnapshot(true)
      // Not currently resizing the image.
      // HomeKit does a good job of resizing and doesn't seem to care if it's not right
      callback(undefined, snapshot)
    } catch (e) {
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
        publicIpPromise = getPublicIp(),
        onRingRtpOptions = new ReplaySubject<RtpOptions>(1),
        [audioProxy, videoProxy] = await Promise.all([
          bindProxyPorts(audioPort, targetAddress, 'audio', onRingRtpOptions),
          bindProxyPorts(videoPort, targetAddress, 'video', onRingRtpOptions)
        ]),
        sipSession = await this.ringCamera.createSipSession({
          address: await publicIpPromise,
          audio: {
            port: audioProxy.localRingPort,
            srtpKey: audioSrtpKey,
            srtpSalt: audioSrtpSalt
          },
          video: {
            port: videoProxy.localRingPort,
            srtpKey: videoSrtpKey,
            srtpSalt: videoSrtpSalt
          }
        }),
        rtpOptions = await sipSession.getRemoteRtpOptions()

      onRingRtpOptions.next(rtpOptions)

      this.sessions[hap.UUIDGen.unparse(sessionID)] = {
        sipSession,
        stop: () => {
          sipSession.stop()
          audioProxy.stop()
          videoProxy.stop()
        }
      }

      this.logger.info(`Waiting for stream data from ${this.ringCamera.name}`)
      const audioSsrc = await audioProxy.onSsrc.pipe(take(1)).toPromise()
      const videoSsrc = await videoProxy.onSsrc.pipe(take(1)).toPromise()
      this.logger.info(`Received stream data from ${this.ringCamera.name}`)

      const currentAddress = ip.address()
      callback({
        address: {
          address: currentAddress,
          type: ip.isV4Format(currentAddress) ? 'v4' : 'v6'
        },
        audio: {
          port: audioProxy.localHomeKitPort,
          ssrc: audioSsrc,
          srtp_key: rtpOptions.audio.srtpKey,
          srtp_salt: rtpOptions.audio.srtpSalt
        },
        video: {
          port: videoProxy.localHomeKitPort,
          ssrc: videoSsrc,
          srtp_key: rtpOptions.video.srtpKey,
          srtp_salt: rtpOptions.video.srtpSalt
        }
      })
    } catch (e) {
      this.logger.error(`Failed to prepare stream for ${this.ringCamera.name}`)
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
      session.sipSession.startRtp().catch(e => {
        this.logger.error(`Failed stream ${this.ringCamera.name}`)
        console.error(e)
      })
    } else if (requestType === 'stop') {
      this.logger.info(`Stopped Live Stream for ${this.ringCamera.name}`)
      session.stop()
      delete this.sessions[sessionKey]
    }
  }
}
