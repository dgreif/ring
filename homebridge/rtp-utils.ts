import { createSocket, Socket } from 'dgram'
import { Observable, ReplaySubject } from 'rxjs'
import { RtpOptions } from '../api'
import { AddressInfo } from 'net'

function isRtpMessage(message: Buffer) {
  const payloadType = message.readUInt8(1) & 0x7f
  return payloadType > 90 || payloadType === 0
}

function getSsrc(message: Buffer) {
  const isRtp = isRtpMessage(message)
  return message.readUInt32BE(isRtp ? 8 : 4)
}

function bindToRandomPort(socket: Socket) {
  return new Promise<number>(resolve => {
    // 0 means select a random open port
    socket.bind(0, () => {
      const { port } = socket.address() as AddressInfo
      resolve(port)
    })
  })
}

export async function bindProxyPorts(
  remoteHomeKitPort: number,
  remoteHomeKitAddress: string,
  type: 'audio' | 'video',
  onRtpOptions: Observable<RtpOptions>
) {
  let ringRtpOptions: RtpOptions | undefined

  const onSsrc = new ReplaySubject<number>(1),
    ringSocket = createSocket('udp4'),
    homeKitSocket = createSocket('udp4'),
    rtpSubscription = onRtpOptions.subscribe(rtpOptions => {
      ringRtpOptions = rtpOptions

      // Now that we know the address/port from Ring, send a message to open NAT
      ringSocket.send('\r\n', ringRtpOptions[type].port, ringRtpOptions.address)
    })

  ringSocket.on('message', message => {
    onSsrc.next(getSsrc(message))
    homeKitSocket.send(message, remoteHomeKitPort, remoteHomeKitAddress)
  })

  homeKitSocket.on('message', message => {
    if (ringRtpOptions) {
      ringSocket.send(
        message,
        ringRtpOptions[type].port,
        ringRtpOptions.address
      )
    }
  })

  const [localRingPort, localHomeKitPort] = await Promise.all([
    bindToRandomPort(ringSocket),
    bindToRandomPort(homeKitSocket)
  ])

  return {
    onSsrc,
    localRingPort,
    localHomeKitPort,
    stop: () => {
      ringSocket.close()
      homeKitSocket.close()
      rtpSubscription.unsubscribe()
    }
  }
}
