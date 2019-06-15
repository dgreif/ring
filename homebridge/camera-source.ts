import { RingCamera } from '../api'
import { hap, HAP } from './hap'
import Service = HAP.Service

// This is a work in progress. Still need to implement stream prep and start
export class CameraSource {
  services: Service[] = []
  streamControllers: any[] = []

  pendingSessions = {}
  ongoingSessions = {}

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

    this.createStreamControllers(2, options)
  }

  async handleSnapshotRequest(
    request: { width: number; height: number },
    callback: (err?: Error, snapshot?: Buffer) => void
  ) {
    console.log('SNAPSHOT REQUESTED!!', request)
    try {
      const snapshot = await this.ringCamera.getSnapshot()
      console.log('GOT SNAPSHOT', new Date(), request)

      callback(undefined, snapshot)
    } catch (e) {
      console.log('FAILED TO GET SNAPSHOT', e)
      callback(e)
    }
  }

  handleCloseConnection(connectionID: any) {
    // this.streamControllers.forEach((controller: StreamController) => {
    //   controller.handleCloseConnection(connectionID)
    // })
  }

  prepareStream(request: any, callback: (response: any) => void) {
    // Invoked when iOS device requires stream
    // callback(new Error('Not implemented'))
    // var sessionInfo = {};
    //
    // let sessionID = request["sessionID"];
    // let targetAddress = request["targetAddress"];
    //
    // sessionInfo["address"] = targetAddress;
    //
    // var response = {};
    //
    // let videoInfo = request["video"];
    // if (videoInfo) {
    //   let targetPort = videoInfo["port"];
    //   let srtp_key = videoInfo["srtp_key"];
    //   let srtp_salt = videoInfo["srtp_salt"];
    //
    //   // SSRC is a 32 bit integer that is unique per stream
    //   let ssrcSource = crypto.randomBytes(4);
    //   ssrcSource[0] = 0;
    //   let ssrc = ssrcSource.readInt32BE(0, true);
    //
    //   let videoResp = {
    //     port: targetPort,
    //     ssrc: ssrc,
    //     srtp_key: srtp_key,
    //     srtp_salt: srtp_salt
    //   };
    //
    //   response["video"] = videoResp;
    //
    //   sessionInfo["video_port"] = targetPort;
    //   sessionInfo["video_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
    //   sessionInfo["video_ssrc"] = ssrc;
    // }
    //
    // let audioInfo = request["audio"];
    // if (audioInfo) {
    //   let targetPort = audioInfo["port"];
    //   let srtp_key = audioInfo["srtp_key"];
    //   let srtp_salt = audioInfo["srtp_salt"];
    //
    //   // SSRC is a 32 bit integer that is unique per stream
    //   let ssrcSource = crypto.randomBytes(4);
    //   ssrcSource[0] = 0;
    //   let ssrc = ssrcSource.readInt32BE(0, true);
    //
    //   let audioResp = {
    //     port: targetPort,
    //     ssrc: ssrc,
    //     srtp_key: srtp_key,
    //     srtp_salt: srtp_salt
    //   };
    //
    //   response["audio"] = audioResp;
    //
    //   sessionInfo["audio_port"] = targetPort;
    //   sessionInfo["audio_srtp"] = Buffer.concat([srtp_key, srtp_salt]);
    //   sessionInfo["audio_ssrc"] = ssrc;
    // }
    //
    // let currentAddress = ip.address();
    // var addressResp = {
    //   address: currentAddress
    // };
    //
    // if (ip.isV4Format(currentAddress)) {
    //   addressResp["type"] = "v4";
    // } else {
    //   addressResp["type"] = "v6";
    // }
    //
    // response["address"] = addressResp;
    // this.pendingSessions[uuid.unparse(sessionID)] = sessionInfo;
    //
    // callback(response);
  }

  handleStreamRequest(request: any) {
    // Invoked when iOS device asks stream to start/stop/reconfigure
    // var sessionID = request["sessionID"];
    // var requestType = request["type"];
    // if (sessionID) {
    //   let sessionIdentifier = uuid.unparse(sessionID);
    //
    //   if (requestType == "start") {
    //     var sessionInfo = this.pendingSessions[sessionIdentifier];
    //     if (sessionInfo) {
    //       var width = 1280;
    //       var height = 720;
    //       var fps = 30;
    //       var bitrate = 300;
    //
    //       let videoInfo = request["video"];
    //       if (videoInfo) {
    //         width = videoInfo["width"];
    //         height = videoInfo["height"];
    //
    //         let expectedFPS = videoInfo["fps"];
    //         if (expectedFPS < fps) {
    //           fps = expectedFPS;
    //         }
    //
    //         bitrate = videoInfo["max_bit_rate"];
    //       }
    //
    //       let targetAddress = sessionInfo["address"];
    //       let targetVideoPort = sessionInfo["video_port"];
    //       let videoKey = sessionInfo["video_srtp"];
    //       let videoSsrc = sessionInfo["video_ssrc"];
    //
    //       let ffmpegCommand = '-re -f avfoundation -r 29.970000 -i 0:0 -threads 0 -vcodec libx264 -an -pix_fmt yuv420p -r '+ fps +' -f rawvideo -tune zerolatency -vf scale='+ width +':'+ height +' -b:v '+ bitrate +'k -bufsize '+ bitrate +'k -payload_type 99 -ssrc '+ videoSsrc +' -f rtp -srtp_out_suite AES_CM_128_HMAC_SHA1_80 -srtp_out_params '+videoKey.toString('base64')+' srtp://'+targetAddress+':'+targetVideoPort+'?rtcpport='+targetVideoPort+'&localrtcpport='+targetVideoPort+'&pkt_size=1378';
    //       let ffmpeg = spawn('ffmpeg', ffmpegCommand.split(' '), {env: process.env});
    //       this.ongoingSessions[sessionIdentifier] = ffmpeg;
    //     }
    //
    //     delete this.pendingSessions[sessionIdentifier];
    //   } else if (requestType == "stop") {
    //     var ffmpegProcess = this.ongoingSessions[sessionIdentifier];
    //     if (ffmpegProcess) {
    //       ffmpegProcess.kill('SIGKILL');
    //     }
    //
    //     delete this.ongoingSessions[sessionIdentifier];
    //   }
    // }
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
