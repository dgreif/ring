import { logDebug, logError } from './util'
import { RtpSplitter, SrtpOptions } from '@homebridge/camera-utils'
const stun = require('stun')

const stunMagicCookie = 0x2112a442 // https://tools.ietf.org/html/rfc5389#section-6

export interface RtpStreamOptions extends SrtpOptions {
  port: number
  rtcpPort: number
}

export interface RtpOptions {
  audio: RtpStreamOptions
  video: RtpStreamOptions
}

export interface RtpStreamDescription extends RtpStreamOptions {
  ssrc?: number
  iceUFrag?: string
  icePwd?: string
}

export interface RtpDescription {
  address: string
  audio: RtpStreamDescription
  video: RtpStreamDescription
}

export function isStunMessage(message: Buffer) {
  return message.length > 8 && message.readInt32BE(4) === stunMagicCookie
}

export function sendStunBindingRequest({
  rtpDescription,
  rtpSplitter,
  rtcpSplitter,
  localUfrag,
  type,
}: {
  rtpSplitter: RtpSplitter
  rtcpSplitter: RtpSplitter
  rtpDescription: RtpDescription
  localUfrag?: string
  type: 'video' | 'audio'
}) {
  const message = stun.createMessage(1),
    remoteDescription = rtpDescription[type],
    { address } = rtpDescription,
    { iceUFrag, icePwd, port, rtcpPort } = remoteDescription

  if (iceUFrag && icePwd && localUfrag) {
    // Full ICE supported.  Send as formal stun request
    message.addUsername(iceUFrag + ':' + localUfrag)
    message.addMessageIntegrity(icePwd)

    stun
      .request(`${address}:${port}`, {
        socket: rtpSplitter.socket,
        message,
      })
      .then(() => logDebug(`${type} stun complete`))
      .catch((e: Error) => {
        logError(`${type} stun error`)
        logError(e)
      })
  } else {
    // ICE not supported.  Fire and forget the stun request for RTP and RTCP
    const encodedMessage = stun.encode(message)
    rtpSplitter.send(encodedMessage, { address, port }).catch(logError)

    rtcpSplitter
      .send(encodedMessage, { address, port: rtcpPort })
      .catch(logError)
  }
}

export function createStunResponder(rtpSplitter: RtpSplitter) {
  return rtpSplitter.addMessageHandler(({ message, info }) => {
    if (!isStunMessage(message)) {
      return null
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

    return null
  })
}
