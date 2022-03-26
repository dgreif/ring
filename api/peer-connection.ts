import {
  ConnectionState,
  MediaStreamTrack,
  RTCIceCandidate,
  RTCPeerConnection,
  RtcpPacket,
  RTCRtpCodecParameters,
  RtpPacket,
} from '@koush/werift'
import { ReplaySubject, Subject } from 'rxjs'
import { logError, logInfo } from './util'

const debug = false

export class PeerConnection {
  pc
  onAudioRtp = new Subject<RtpPacket>()
  onAudioRtcp = new Subject<RtcpPacket>()
  onVideoRtp = new Subject<RtpPacket>()
  onVideoRtcp = new Subject<RtcpPacket>()
  onIceCandidate = new Subject<RTCIceCandidate>()
  onConnectionState = new ReplaySubject<ConnectionState>(1)
  returnAudioTrack = new MediaStreamTrack({ kind: 'audio' })

  constructor() {
    const pc = (this.pc = new RTCPeerConnection({
        codecs: {
          audio: [
            new RTCRtpCodecParameters({
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
            }),
          ],
          video: [
            new RTCRtpCodecParameters({
              mimeType: 'video/H264',
              clockRate: 90000,
              rtcpFeedback: [
                { type: 'transport-cc' },
                { type: 'ccm', parameter: 'fir' },
                { type: 'nack' },
                { type: 'nack', parameter: 'pli' },
                { type: 'goog-remb' },
              ],
              parameters: 'profile-level-id=42801F',
            }),
          ],
        },
      })),
      audioTransceiver = pc.addTransceiver(this.returnAudioTrack, {
        direction: 'sendrecv',
      }),
      videoTransceiver = pc.addTransceiver('video', {
        direction: 'recvonly',
      })

    audioTransceiver.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        this.onAudioRtp.next(rtp)
      })

      track.onReceiveRtcp.subscribe((rtcp) => {
        this.onAudioRtcp.next(rtcp)
      })

      if (debug) {
        track.onReceiveRtp.once(() => {
          logInfo('received first audio packet')
        })
      }
    })

    videoTransceiver.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        this.onVideoRtp.next(rtp)
      })

      track.onReceiveRtcp.subscribe((rtcp) => {
        this.onVideoRtcp.next(rtcp)
      })

      track.onReceiveRtp.once(() => {
        if (debug) {
          logInfo('received first video packet')
        }

        setInterval(
          () => videoTransceiver.receiver.sendRtcpPLI(track.ssrc!),
          2000
        )
      })
    })
    this.pc.onIceCandidate.subscribe((iceCandidate) => {
      this.onIceCandidate.next(iceCandidate)
    })

    pc.iceConnectionStateChange.subscribe(() => {
      logInfo(`iceConnectionStateChange: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === 'closed') {
        this.onConnectionState.next('closed')
      }
    })
    pc.connectionStateChange.subscribe(() => {
      logInfo(`connectionStateChange: ${pc.connectionState}`)
      this.onConnectionState.next(pc.connectionState)
    })
  }

  async createOffer() {
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)

    return offer
  }

  async acceptAnswer(answer: { type: 'answer'; sdp: string }) {
    await this.pc.setRemoteDescription(answer)
  }

  addIceCandidate(candidate: RTCIceCandidate) {
    return this.pc.addIceCandidate(candidate)
  }

  close() {
    this.pc.close().catch(logError)
  }
}
