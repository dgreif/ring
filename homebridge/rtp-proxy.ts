import { RtpOptions, SipSession } from '../api'
import { ReplaySubject } from 'rxjs'
import { createSocket } from 'dgram'
import { bindToRandomPort, getSsrc } from '../api/rtp-utils'
import { filter, map, take } from 'rxjs/operators'

export async function bindProxyPorts(
  remotePort: number,
  remoteAddress: string,
  type: 'audio' | 'video',
  sipSession: SipSession
) {
  let ringRtpOptions: RtpOptions | undefined

  const onSsrc = new ReplaySubject<number>(1),
    socket = createSocket('udp4'),
    rtpStream =
      type === 'audio' ? sipSession.audioStream : sipSession.videoStream,
    subscriptions = [
      sipSession.onRemoteRtpOptions.subscribe(rtpOptions => {
        ringRtpOptions = rtpOptions
      }),
      rtpStream.onRtpPacket.subscribe(({ message }) => {
        socket.send(message, remotePort, remoteAddress)
      }),
      rtpStream.onRtpPacket
        .pipe(
          map(({ message }) => getSsrc(message)),
          filter(x => x !== null),
          take(1)
        )
        .subscribe(ssrc => ssrc && onSsrc.next(ssrc))
    ]

  socket.on('message', message => {
    if (ringRtpOptions) {
      rtpStream.socket.send(
        message,
        ringRtpOptions[type].port,
        ringRtpOptions.address
      )
    }
  })

  const localPort = await bindToRandomPort(socket)

  sipSession.onCallEnded.subscribe(() => {
    socket.close()
    subscriptions.forEach(subscription => subscription.unsubscribe())
  })

  return {
    ssrcPromise: onSsrc.pipe(take(1)).toPromise(),
    localPort
  }
}
