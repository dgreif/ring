import { createSocket, RemoteInfo, Socket } from 'dgram'
import { AddressInfo } from 'net'
import { fromEvent, merge, ReplaySubject } from 'rxjs'
import { map, share, takeUntil } from 'rxjs/operators'
import getPort from 'get-port'
import { randomBytes } from 'crypto'
import { logDebug, logError, logInfo } from './util'
import os from 'os'
import { networkInterfaceDefault } from 'systeminformation'
const stun = require('stun')

export interface SrtpOptions {
  srtpKey: Buffer
  srtpSalt: Buffer
}

export interface RtpStreamOptions extends SrtpOptions {
  port: number
}

export interface RtpOptions {
  audio: RtpStreamOptions
  video: RtpStreamOptions
}

export interface RtpStreamDescription extends RtpStreamOptions {
  ssrc: number
  iceUFrag: string
  icePwd: string
}

export interface RtpDescription {
  address: string
  audio: RtpStreamDescription
  video: RtpStreamDescription
}

export async function getDefaultIpAddress(preferIpv6 = false) {
  const interfaces = os.networkInterfaces(),
    defaultInterfaceName = await networkInterfaceDefault(),
    defaultInterface = interfaces[defaultInterfaceName],
    externalInfo = defaultInterface?.filter((info) => !info.internal),
    preferredFamily = preferIpv6 ? 'IPv6' : 'IPv4',
    addressInfo =
      externalInfo?.find((info) => info.family === preferredFamily) ||
      externalInfo?.[0]

  if (!addressInfo) {
    logInfo(
      JSON.stringify(
        {
          defaultInterfaceName,
          interfaces,
        },
        null,
        2
      )
    )

    throw new Error('Unable to get default network address')
  }

  return addressInfo.address
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

function isRtpMessagePayloadType(payloadType: number) {
  return payloadType > 90 || payloadType === 0
}

export function getSsrc(message: Buffer) {
  try {
    const payloadType = getPayloadType(message),
      isRtp = isRtpMessagePayloadType(payloadType)
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

export interface SocketTarget {
  port: number
  address?: string
}

interface RtpMessageDescription {
  isRtpMessage: boolean
  isStunMessage: boolean
  payloadType: number
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
    map(([message, info]) => {
      const payloadType = getPayloadType(message)

      return {
        message,
        info,
        isRtpMessage: isRtpMessagePayloadType(payloadType),
        isStunMessage: payloadType === 1,
        payloadType,
      }
    }),
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

export function sendStunBindingRequest({
  rtpDescription,
  rtpSplitter,
  localUfrag,
  type,
}: {
  rtpSplitter: RtpSplitter
  rtpDescription: RtpDescription
  localUfrag: string
  type: 'video' | 'audio'
}) {
  const message = stun.createMessage(1),
    remoteDescription = rtpDescription[type]

  message.addUsername(remoteDescription.iceUFrag + ':' + localUfrag)
  message.addMessageIntegrity(remoteDescription.icePwd)
  stun
    .request(`${rtpDescription.address}:${remoteDescription.port}`, {
      socket: rtpSplitter.socket,
      message,
    })
    .then(() => logDebug(`${type} stun complete`))
    .catch((e: Error) => {
      logError(`${type} stun error`)
      logError(e)
    })
}

export function createStunResponder(rtpSplitter: RtpSplitter) {
  return rtpSplitter.onMessage.subscribe(({ message, info, isStunMessage }) => {
    if (!isStunMessage) {
      return
    }

    try {
      const decodedMessage = stun.decode(message),
        response = stun.createMessage(
          stun.constants.STUN_BINDING_RESPONSE,
          decodedMessage.transactionId
        )

      response.addXorAddress(info.address, info.port)
      rtpSplitter.send(stun.encode(response), info).catch(logError)
    } catch (e) {
      logDebug('Failed to Decode STUN Message')
      logDebug(message.toString('hex'))
      logDebug(e)
    }
  })
}
