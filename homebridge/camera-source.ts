import { RingCamera } from '../api'
import { hap, HAP } from './hap'
import Service = HAP.Service

// This is a work in progress. Still need to implement stream prep and start
export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []

  constructor(private ringCamera: RingCamera) {
    let options = {
      proxy: false, // Requires RTP/RTCP MUX Proxy
      disable_audio_proxy: false, // If proxy = true, you can opt out audio proxy via this
      srtp: true, // Supports SRTP AES_CM_128_HMAC_SHA1_80 encryption
      video: {
        resolutions: [
          [1920, 1080, 30], // Width, Height, framerate
          [320, 240, 15], // Apple Watch requires this configuration
          [1280, 960, 30],
          [1280, 720, 30],
          [1024, 768, 30],
          [640, 480, 30],
          [640, 360, 30],
          [480, 360, 30],
          [480, 270, 30],
          [320, 240, 30],
          [320, 180, 30]
        ],
        codec: {
          profiles: [0, 1, 2], // Enum, please refer StreamController.VideoCodecParamProfileIDTypes
          levels: [0, 1, 2] // Enum, please refer StreamController.VideoCodecParamLevelTypes
        }
      },
      audio: {
        comfort_noise: false,
        codecs: [
          {
            type: 'OPUS', // Audio Codec
            samplerate: 24 // 8, 16, 24 KHz
          },
          {
            type: 'AAC-eld',
            samplerate: 16
          }
        ]
      }
    }

    this.createCameraControlService()
    this.createStreamControllers(2, options)
  }

  async handleSnapshotRequest(
    request: { width: number; height: number },
    callback: (err?: Error, snapshot?: Buffer) => void
  ) {
    try {
      const snapshot = await this.ringCamera.getSnapshot()
      callback(undefined, snapshot)
    } catch (e) {
      callback(e)
    }
  }

  handleCloseConnection(connectionID: any) {}

  prepareStream(request: any, callback: (response: any) => void) {
    callback(new Error('Not implemented'))
  }

  handleStreamRequest(request: any) {}

  private createCameraControlService() {
    let controlService = new hap.Service.CameraControl()
    this.services.push(controlService)
  }

  private createStreamControllers(maxStreams: number, options: any) {
    let self = this

    for (var i = 0; i < maxStreams; i++) {
      var streamController = new hap.StreamController(i, options, self)

      self.services.push(streamController.service)
      self.streamControllers.push(streamController)
    }
  }
}
