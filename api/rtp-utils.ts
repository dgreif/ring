import { createSocket, Socket } from 'dgram'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
import { SipSession } from './sip-session'
import { ReplaySubject } from 'rxjs'
import { filter, map, take } from 'rxjs/operators'
import { randomBytes } from 'crypto'
import getPort from 'get-port'
import execa from 'execa'
import { logError } from './util'
const stun = require('stun'),
  portControl = require('nat-puncher')

let preferredExternalPorts: number[] | undefined, ffmpegPath: string | undefined

export function setPreferredExternalPorts(start: number, end: number) {
  const count = end - start + 1

  preferredExternalPorts = Array.from(new Array(count)).map((_, i) => i + start)
}

export function setFfmpegPath(path: string) {
  ffmpegPath = path
}

export function getFfmpegPath() {
  return ffmpegPath || 'ffmpeg'
}

export interface SrtpOptions {
  srtpKey: Buffer
  srtpSalt: Buffer
}

export interface RtpStreamOptions extends Partial<SrtpOptions> {
  port: number
}

export interface RtpOptions {
  address: string
  audio: RtpStreamOptions
  video: RtpStreamOptions
}

export async function getPublicIpViaStun() {
  const response = await stun.request('stun.l.google.com:19302')
  return response.getXorAddress().address
}

export function getPublicIp() {
  return fetchPublicIp()
    .catch(() => getPublicIpViaStun())
    .catch(() => {
      throw new Error('Failed to retrieve public ip address')
    })
}

let reservedPorts: number[] = []
export function releasePorts(ports: number[]) {
  reservedPorts = reservedPorts.filter((p) => !ports.includes(p))
}

// Need to reserve ports in sequence because ffmpeg uses the next port up by default.  If it's taken, ffmpeg will error
// These "buffer" ports are internal only, so they don't need to stay within "preferred external ports"
export async function reservePorts({
  count = 1,
  forExternalUse = false,
  attemptedPorts = [],
}: {
  count?: number
  forExternalUse?: boolean
  attemptedPorts?: number[]
} = {}): Promise<number[]> {
  const availablePorts =
      forExternalUse && preferredExternalPorts
        ? preferredExternalPorts.filter((p) => !reservedPorts.includes(p))
        : undefined,
    port = await getPort({ port: availablePorts }),
    ports = [port],
    tryAgain = () => {
      return reservePorts({
        count,
        forExternalUse,
        attemptedPorts: attemptedPorts.concat(ports),
      })
    }

  if (reservedPorts.includes(port)) {
    // this avoids race conditions where we can reserve the same port twice
    return tryAgain()
  }

  if (availablePorts && !availablePorts.includes(port)) {
    logError(
      'Preferred external ports depleted!  Falling back to random external port.  Consider expanding the range specified in your externalPorts config'
    )
  }

  for (let i = 1; i < count; i++) {
    const targetConsecutivePort = port + i,
      openPort = await getPort({ port: targetConsecutivePort })

    if (openPort !== targetConsecutivePort) {
      // can't reserve next port, bail and get another set
      return tryAgain()
    }

    ports.push(openPort)
  }

  if (ports.some((p) => reservedPorts.includes(p))) {
    return tryAgain()
  }

  reservedPorts.push(...ports)
  return ports
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

export async function bindToPort(
  socket: Socket,
  { forExternalUse = false } = {}
) {
  const [desiredPort] = await reservePorts({ forExternalUse })

  return new Promise<number>((resolve, reject) => {
    socket.on('error', reject)

    // 0 means select a random open port
    socket.bind(desiredPort, () => {
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
      sipSession.onRemoteRtpOptions.subscribe((rtpOptions) => {
        ringRtpOptions = rtpOptions
      }),
      rtpStream.onRtpPacket.subscribe(({ message }) => {
        socket.send(message, remotePort, remoteAddress)
      }),
      rtpStream.onRtpPacket
        .pipe(
          map(({ message }) => getSsrc(message)),
          filter((x) => x !== null),
          take(1)
        )
        .subscribe((ssrc) => ssrc && onSsrc.next(ssrc)),
    ]

  socket.on('message', (message) => {
    if (ringRtpOptions) {
      rtpStream.socket.send(
        message,
        ringRtpOptions[type].port,
        ringRtpOptions.address
      )
    }
  })

  const localPort = await bindToPort(socket)
  sipSession.reservedPorts.push(localPort)

  sipSession.onCallEnded.subscribe(() => {
    socket.close()
    subscriptions.forEach((subscription) => subscription.unsubscribe())
  })

  return {
    ssrcPromise: onSsrc.pipe(take(1)).toPromise(),
    localPort,
  }
}

export async function doesFfmpegSupportCodec(codec: string) {
  const output = await execa(getFfmpegPath(), ['-codecs'])
  return output.stdout.includes(codec)
}
