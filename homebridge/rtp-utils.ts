import { createSocket } from 'dgram'
import { Observable, ReplaySubject } from 'rxjs'
import { RtpOptions } from '../api'
const getports = require('getports')

export function isRtpMessage(message: Buffer) {
  const payloadType = message.readUInt8(1) & 0x7f
  return payloadType > 90 || payloadType === 0
}

export function getSsrc(message: Buffer) {
  const isRtp = isRtpMessage(message)
  return message.readUInt32BE(isRtp ? 8 : 4)
}

export function getOpenPorts(count = 1, start = 10000) {
  return new Promise<number[]>((resolve, reject) => {
    getports(count, { start }, (error: Error | null, ports: number[]) => {
      if (error) {
        return reject(error)
      }

      resolve(ports)
    })
  })
}

export function bindProxyPorts(
  localRingPort: number,
  localHomeKitPort: number,
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

  ringSocket.bind(localRingPort)
  homeKitSocket.bind(localHomeKitPort)

  return {
    onSsrc,
    stop: () => {
      ringSocket.close()
      homeKitSocket.close()
      rtpSubscription.unsubscribe()
    }
  }
}
