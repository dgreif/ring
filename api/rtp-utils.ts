import { Socket } from 'dgram'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
const stun = require('stun'),
  portControl = require('nat-puncher')

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
  try {
    const isRtp = isRtpMessage(message)
    return message.readUInt32BE(isRtp ? 8 : 4)
  } catch (_) {
    return null
  }
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

export function sendUdpHolePunch(
  socket: Socket,
  localPort: number,
  remotePort: number,
  remoteAddress: string,
  lifetimeSeconds: number
) {
  socket.send('', remotePort, remoteAddress)
  portControl.addMapping(localPort, localPort, lifetimeSeconds)
}
