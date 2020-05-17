import { createSocket, RemoteInfo, Socket } from 'dgram'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
import { fromEvent, merge, ReplaySubject } from 'rxjs'
import { map, share, takeUntil } from 'rxjs/operators'
import getPort from 'get-port'
import { logError } from './util'
const stun = require('stun'),
  portControl = require('nat-puncher')

let preferredExternalPorts: number[] | undefined

export function setPreferredExternalPorts(start: number, end: number) {
  const count = end - start + 1

  preferredExternalPorts = Array.from(new Array(count)).map((_, i) => i + start)
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

export function isRtpMessage(message: Buffer) {
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

export interface SocketTarget {
  port: number
  address?: string
}

interface RtpMessageDescription {
  isRtpMessage: boolean
  info: RemoteInfo
  message: Buffer
}
type RtpMessageHandler = (
  description: RtpMessageDescription
) => SocketTarget | null

export class RtpSplitter {
  public readonly socket = createSocket('udp4')
  public readonly portPromise = bindToPort(this.socket, this.options)
  private onClose = new ReplaySubject<any>()
  public readonly onMessage = fromEvent<[Buffer, RemoteInfo]>(
    this.socket,
    'message'
  ).pipe(
    map(([message, info]) => ({
      message,
      info,
      isRtpMessage: isRtpMessage(message),
    })),
    takeUntil(this.onClose),
    share()
  )

  constructor(
    public readonly options = { forExternalUse: false },
    messageHandler?: RtpMessageHandler
  ) {
    if (messageHandler) {
      this.addMessageHandler(messageHandler)
    }

    merge(fromEvent(this.socket, 'close'), fromEvent(this.socket, 'error'))
      .pipe(takeUntil(this.onClose))
      .subscribe(() => {
        this.cleanUp()
      })
  }

  addMessageHandler(handler: RtpMessageHandler) {
    this.onMessage.subscribe((description) => {
      const forwardingTarget = handler(description)

      if (forwardingTarget) {
        this.send(description.message, forwardingTarget)
      }
    })
  }

  async send(message: Buffer, sendTo: SocketTarget) {
    await this.portPromise
    this.socket.send(message, sendTo.port, sendTo.address || '127.0.0.1')
  }

  private cleanedUp = false
  private cleanUp() {
    this.closed = true

    if (this.cleanedUp) {
      return
    }

    this.cleanedUp = true
    this.onClose.next()
    this.portPromise.then((port) => releasePorts([port]))
  }

  private closed = false
  close() {
    if (this.closed) {
      return
    }

    this.socket.close()
    this.cleanUp()
  }
}

export function createCryptoLine(rtpStreamOptions: Partial<SrtpOptions>) {
  const srtpValue = getSrtpValue(rtpStreamOptions)

  if (!srtpValue) {
    return ''
  }

  return `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${srtpValue}`
}

export function decodeCryptoKey(encordedCrypto: string) {
  const crypto = Buffer.from(encordedCrypto, 'base64')

  return {
    srtpKey: crypto.slice(0, 16),
    srtpSalt: crypto.slice(16, 30),
  }
}
