/* eslint-disable brace-style */
import {
  ConnectionState,
  MediaStreamTrack,
  RTCIceCandidate,
  RTCPeerConnection,
  RtcpPacket,
  RTCRtpCodecParameters,
  RtpPacket,
} from 'werift'
import { interval, merge, Observable, ReplaySubject, Subject } from 'rxjs'
import { logDebug, logError, logInfo } from '../util'
import { Subscribed } from '../subscribed'

const ringIceServers = [
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
  addIceCandidate(candidate: Partial<RTCIceCandidate>): Promise<void>
  onIceCandidate: Observable<RTCIceCandidate>
  onConnectionState: Observable<ConnectionState>
  close(): void
  requestKeyFrame?: () => void
}

export class WeriftPeerConnection
  extends Subscribed
  implements BasicPeerConnection
{
  private pc
  onAudioRtp = new Subject<RtpPacket>()
  onAudioRtcp = new Subject<RtcpPacket>()
  onVideoRtp = new Subject<RtpPacket>()
  onVideoRtcp = new Subject<RtcpPacket>()
  onIceCandidate = new Subject<RTCIceCandidate>()
  onConnectionState = new ReplaySubject<ConnectionState>(1)
  returnAudioTrack = new MediaStreamTrack({ kind: 'audio' })
  private onRequestKeyFrame = new Subject<void>()

  constructor() {
    super()
    const pc = (this.pc = new RTCPeerConnection({
        codecs: {
          audio: [
            new RTCRtpCodecParameters({
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
            }),
            new RTCRtpCodecParameters({
              mimeType: 'audio/PCMU',
              clockRate: 8000,
              channels: 1,
              payloadType: 0,
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
            new RTCRtpCodecParameters({
              mimeType: 'video/rtx',
              clockRate: 90000,
            }),
          ],
        },
        iceServers: ringIceServers.map((server) => ({ urls: server })),
        iceTransportPolicy: 'all',
        bundlePolicy: 'disable',
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

      track.onReceiveRtp.once(() => {
        logDebug('received first audio packet')
      })
    })

    videoTransceiver.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        this.onVideoRtp.next(rtp)
      })

      track.onReceiveRtcp.subscribe((rtcp) => {
        this.onVideoRtcp.next(rtcp)
      })

      track.onReceiveRtp.once(() => {
        logDebug('received first video packet')

        this.addSubscriptions(
          merge(this.onRequestKeyFrame, interval(4000)).subscribe(() => {
            videoTransceiver.receiver
              .sendRtcpPLI(track.ssrc!)
              .catch((e) => logError(e))
          })
        )
        this.requestKeyFrame()
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

  requestKeyFrame() {
    this.onRequestKeyFrame.next()
  }

  close() {
    this.pc.close().catch(logError)
    this.unsubscribe()
  }
}
