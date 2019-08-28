import { createSocket, Socket } from 'dgram'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
import { RtpOptions, SipSession } from './sip-session'
import { ReplaySubject } from 'rxjs'
import { filter, map, take } from 'rxjs/operators'
import { randomBytes } from 'crypto'
import getPort from 'get-port'
import execa from 'execa'
const stun = require('stun'),
  portControl = require('nat-puncher')

export interface SrtpOptions {
  srtpKey: Buffer
  srtpSalt: Buffer
}

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

let reservedPorts: number[] = []
export async function reservePorts(count = 1): Promise<number[]> {
  const port = await getPort(),
    ports = [port]

  if (reservedPorts.includes(port)) {
    // this avoids race conditions where we can reserve the same port twice
    return reservePorts(count)
  }

  for (let i = 1; i < count; i++) {
    const targetConsecutivePort = port + i,
      openPort = await getPort({ port: targetConsecutivePort })

    if (openPort !== targetConsecutivePort) {
      // can't reserve next port, bail and get another set
      return reservePorts(count)
    }

    ports.push(openPort)
  }

  if (ports.some(p => reservedPorts.includes(p))) {
    return reservePorts(count)
  }

  reservedPorts.push(...ports)
  return ports
}

export function releasePort(port: number) {
  reservedPorts = reservedPorts.filter(p => p !== port)
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

export function generateSsrc() {
  const ssrcSource = randomBytes(4)
  ssrcSource[0] = 0
  return ssrcSource.readInt32BE(0)
}

export function getSrtpValue({ srtpKey, srtpSalt }: Partial<SrtpOptions>) {
  if (!srtpKey || !srtpSalt) {
    return ''
  }

  return Buffer.concat([srtpKey, srtpSalt]).toString('base64')
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
  socket.send(Buffer.alloc(8), remotePort, remoteAddress)
  portControl.addMapping(localPort, localPort, lifetimeSeconds)
}

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

export async function doesFfmpegSupportCodec(codec: string) {
  const output = await execa('ffmpeg', ['-codecs'])
  return output.stdout.includes(codec)
}
