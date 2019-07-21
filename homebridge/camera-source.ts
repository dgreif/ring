import { RingCamera } from '../api'
import { hap, HAP } from './hap'
import Service = HAP.Service

// SOMEDAY: implement stream prepareStream and handleStreamRequest
export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []

  constructor(private ringCamera: RingCamera) {
    let options = {
      video: {
        resolutions: [],
        codec: {
          profiles: [],
          levels: []
        }
      },
      audio: {
        codecs: []
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
      const snapshot = await this.ringCamera.getSnapshot({
        allowStale: true,
        resize: request
      })
      callback(undefined, snapshot)
    } catch (e) {
      callback(e)
    }
  }

  handleCloseConnection(connectionID: any) {}

  prepareStream(request: any, callback: (response: any) => void) {
    // intentionally ignore the request.  This prevents "No Response" overlay for about 20s
  }

  handleStreamRequest(request: any) {}
}
