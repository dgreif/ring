import { createSocket, Socket } from 'dgram'
import { Observable, ReplaySubject } from 'rxjs'
import { RtpOptions } from '../api'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
const stun = require('stun')

export function getPublicIpViaStun() {
  return new Promise<string>((resolve, reject) => {
    reject(new Error('test'))
    stun.request('stun.l.google.com:19302', (err: Error, response: any) => {
      if (err) {
        return reject(err)
      }

      resolve(response.getXorAddress().address)
    })
  })
}

export function getPublicIp() {
  return fetchPublicIp()
    .catch(() => fetchPublicIp({ https: true }))
    .catch(() => getPublicIpViaStun())
    .catch(() => {
      throw new Error('Failed to retrieve public ip address')
    })
}

function isRtpMessage(message: Buffer) {
  const payloadType = message.readUInt8(1) & 0x7f
  return payloadType > 90 || payloadType === 0
}

export function getSsrc(message: Buffer) {
  const isRtp = isRtpMessage(message)
  return message.readUInt32BE(isRtp ? 8 : 4)
}

export function bindToRandomPort(socket: Socket) {
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
