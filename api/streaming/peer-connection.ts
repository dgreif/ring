import {
  ConnectionState,
  MediaStreamTrack,
  RTCIceCandidate,
  RTCPeerConnection,
  RtcpPacket,
  RTCRtpCodecParameters,
  RtpPacket,
} from '@koush/werift'
import { Observable, ReplaySubject, Subject } from 'rxjs'
import { logError, logInfo } from '../util'

const debug = false,
  ringIceServers = [
    'stun:stun.kinesisvideo.us-east-1.amazonaws.com:443',
    'stun:stun.kinesisvideo.us-east-2.amazonaws.com:443',
    'stun:stun.kinesisvideo.us-west-2.amazonaws.com:443',
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302',
  ]

export interface BasicPeerConnection {
  createOffer(): Promise<{ sdp: string }>
  createAnswer(offer: {
    type: 'offer'
    sdp: string
  }): Promise<RTCSessionDescriptionInit>
  acceptAnswer(answer: { type: 'answer'; sdp: string }): Promise<void>
  addIceCandidate(candidate: RTCIceCandidate): Promise<void>
  onIceCandidate: Observable<RTCIceCandidate>
  onConnectionState: Observable<ConnectionState>
  close(): void
}

export class WeriftPeerConnection implements BasicPeerConnection {
  private pc
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
              parameters:
                'packetization-mode=1;profile-level-id=640029;level-asymmetry-allowed=1',
            }),
          ],
        },
        iceServers: ringIceServers.map((server) => ({ urls: server })),
        iceTransportPolicy: 'all',
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

  async createAnswer(offer: { type: 'offer'; sdp: string }) {
    await this.pc.setRemoteDescription(offer)
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)

    return answer
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
