import { createSocket, RemoteInfo, Socket } from 'dgram'
import { AddressInfo } from 'net'
import { v4 as fetchPublicIp } from 'public-ip'
import { fromEvent, merge, ReplaySubject } from 'rxjs'
import { map, share, takeUntil } from 'rxjs/operators'
import getPort from 'get-port'
import { randomBytes } from 'crypto'
import { logError } from './util'
import os from 'os'
const stun = require('stun'),
  ip = require('ip')

export interface SrtpOptions {
  srtpKey: Buffer
  srtpSalt: Buffer
}

export interface RtpStreamOptions extends SrtpOptions {
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
      logError(
        'Failed to retrieve public ip address.  Falling back to local ip and RTP latching'
      )
      return ip.address()
    })
}

let reservedPorts: number[] = []
export function releasePorts(ports: number[]) {
  reservedPorts = reservedPorts.filter((p) => !ports.includes(p))
}

// Need to reserve ports in sequence because ffmpeg uses the next port up by default.  If it's taken, ffmpeg will error
export async function reservePorts({
  count = 1,
  attemptedPorts = [],
}: {
  count?: number
  attemptedPorts?: number[]
} = {}): Promise<number[]> {
  const port = await getPort(),
    ports = [port],
    tryAgain = () => {
      return reservePorts({
        count,
        attemptedPorts: attemptedPorts.concat(ports),
      })
    }

  if (reservedPorts.includes(port)) {
    // this avoids race conditions where we can reserve the same port twice
    return tryAgain()
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

export function getPayloadType(message: Buffer) {
  return message.readUInt8(1) & 0x7f
}

export function isRtpMessage(message: Buffer) {
  const payloadType = getPayloadType(message)
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

export async function bindToPort(socket: Socket) {
  const [desiredPort] = await reservePorts()

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
  remoteAddress: string
) {
  socket.send(Buffer.alloc(8), remotePort, remoteAddress)
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
  public readonly portPromise = bindToPort(this.socket)
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

  constructor(messageHandler?: RtpMessageHandler) {
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

export function getSrtpValue({ srtpKey, srtpSalt }: SrtpOptions) {
  return Buffer.concat([srtpKey, srtpSalt]).toString('base64')
}

export function createCryptoLine(rtpStreamOptions: SrtpOptions) {
  const srtpValue = getSrtpValue(rtpStreamOptions)

  return `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${srtpValue}`
}

export function decodeCryptoValue(encordedCrypto: string): SrtpOptions {
  const crypto = Buffer.from(encordedCrypto, 'base64')

  return {
    srtpKey: crypto.slice(0, 16),
    srtpSalt: crypto.slice(16, 30),
  }
}

export function generateSrtpOptions(): SrtpOptions {
  return {
    srtpKey: randomBytes(16),
    srtpSalt: randomBytes(14),
  }
}

export function getIpAddresses(family = 'ipv4'): Array<string> {
  const interfaces = os.networkInterfaces(),
    familyLower = family.toLowerCase()

  return Object.entries(interfaces).reduce(
    (addresses, [key, interfaceInfos]) => {
      // Skip all virtual and bridge interfaces
      if (key.startsWith('v') || key.startsWith('br')) {
        return addresses
      }

      const matchingAddresses = (interfaceInfos || []).reduce(
        (matches, interfaceInfo) => {
          // Remove addresses that have incorrect family or are internal
          if (
            interfaceInfo.internal ||
            interfaceInfo.family.toLowerCase() !== familyLower
          ) {
            return matches
          }

          return matches.concat([interfaceInfo.address])
        },
        [] as string[]
      )

      return addresses.concat(matchingAddresses)
    },
    [] as string[]
  )
}

export function getIpAddress(family?: string) {
  const addresses = getIpAddresses(family),
    address = addresses[0]

  if (!address) {
    throw new Error('Unable to detect you IP Address')
  }

  return address
}
