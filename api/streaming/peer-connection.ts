import type { Observable, Subject } from 'rxjs'
import type { ConnectionState, RtpPacket } from 'werift'

export interface BasicPeerConnection {
  onAudioRtp?: Subject<RtpPacket>
  onVideoRtp?: Subject<RtpPacket>

  createOffer(): Promise<{ sdp: string }>
  createAnswer(offer: {
    type: 'offer'
    sdp: string
  }): Promise<RTCSessionDescriptionInit>
  acceptAnswer(answer: { type: 'answer'; sdp: string }): Promise<void>
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>
  onIceCandidate: Observable<RTCIceCandidateInit>
  onConnectionState: Observable<ConnectionState>
  close(): void
  sendAudioPacket?(rtp: RtpPacket | Buffer): void
}
