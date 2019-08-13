const fs = require('fs')

// =================================================================
// | RTP packet header                                             |
// -----------------------------------------------------------------
// |0|1|2|3|4|5|6|7|0|1|2|3|4|5|6|7|0|1|2|3|4|5|6|7|0|1|2|3|4|5|6|7|
// =================================================================
// | V |P|X| CC    |M| PT          | Sequence number               |
// -----------------------------------------------------------------
// | Timestamp                                                     |
// -----------------------------------------------------------------
// | SSRC                                                          |
// =================================================================
// | CSRC                                                          |
// |                                                               |
// -----------------------------------------------------------------
// | header id                     | header length                 |
// -----------------------------------------------------------------
// | header                                                        |
// |                                                               |
// =================================================================

// =================
// |0|1|2|3|4|5|6|7|
// =================
// |F|NRI| Type    |
// =================

/**
 * Translates the RTP packets to an H.264 encoded binary.
 *
 * @author bourdakos1 https://github.com/bourdakos1
 * Pulled in from his repo: https://github.com/bourdakos1/ring-streamer/blob/master/H264Builder.js
 */
export class H264Builder {
  fileStream: any
  constructor(name: string) {
    try {
      fs.unlinkSync(name)
    } catch {}

    this.fileStream = fs.createWriteStream(name)
  }
  end() {
    this.fileStream.end()
  }

  packetReceived(message: Buffer) {
    const row0 = message.readUInt32BE(0),
      version = (row0 & parseInt('11000000000000000000000000000000', 2)) >>> 30,
      padding = (row0 & parseInt('00100000000000000000000000000000', 2)) >>> 29,
      extension =
        (row0 & parseInt('00010000000000000000000000000000', 2)) >>> 28,
      csrcCount =
        (row0 & parseInt('00001111000000000000000000000000', 2)) >>> 24,
      marker = (row0 & parseInt('00000000100000000000000000000000', 2)) >>> 23,
      payloadType =
        (row0 & parseInt('00000000011111110000000000000000', 2)) >>> 16,
      sequenceNum =
        (row0 & parseInt('00000000000000001111111111111111', 2)) >>> 0,
      isH264 = payloadType === 99 // Defined in our SIP INVITE.
    if (!isH264) {
      return
    }

    const timestamp = message.readUInt32BE(4),
      ssrc = message.readUInt32BE(8),
      payloadStartOffset = 12 + 4 * csrcCount,
      nalUnitHeader = message.readUInt8(payloadStartOffset),
      forbidden = (nalUnitHeader & parseInt('10000000', 2)) >>> 7, // Must be zero.
      nri = (nalUnitHeader & parseInt('01100000', 2)) >>> 5,
      nalType = (nalUnitHeader & parseInt('00011111', 2)) >>> 0

    if (forbidden !== 0) {
      return
    }

    if (nalType >= 1 && nalType <= 23) {
      // Standard NAL Unit
      this.fileStream.write(Buffer.from([0x00, 0x00, 0x00, 0x01]))
      this.fileStream.write(message.subarray(payloadStartOffset))
    } else if (nalType === 24) {
      return // STAP-A ignore for now.
    } else if (nalType === 28) {
      // FU-A
      // TODO: Check that we didn't drop pieces of the fragment.
      const fragmentHeader = message.readUInt8(payloadStartOffset + 1),
        start = (fragmentHeader & parseInt('10000000', 2)) >>> 7,
        end = (fragmentHeader & parseInt('01000000', 2)) >>> 6,
        reserved = (fragmentHeader & parseInt('00100000', 2)) >>> 5
      if (reserved !== 0) {
        return
      }
      const nalType = (fragmentHeader & parseInt('00011111', 2)) >>> 0
      if (start === 1) {
        this.fileStream.write(Buffer.from([0x00, 0x00, 0x00, 0x01]))
        const reconstructedHeader =
          (forbidden << 7) | (nri << 5) | (nalType << 0)
        this.fileStream.write(Buffer.from([reconstructedHeader]))
      }
      this.fileStream.write(message.subarray(payloadStartOffset + 2))
    } else {
      return
    }
  }
}
