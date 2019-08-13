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
    fs.existsSync(name) && fs.unlinkSync(name)
    this.fileStream = fs.createWriteStream(name)
  }
  end() {
    this.fileStream.end()
  }

  packetReceived(message: Buffer) {
    const row0 = message.readUInt32BE(0),
      csrcCount =
        (row0 & parseInt('00001111000000000000000000000000', 2)) >>> 24,
      payloadType =
        (row0 & parseInt('00000000011111110000000000000000', 2)) >>> 16,
      isH264 = payloadType === 99 // Defined in our SIP INVITE.
    if (!isH264) {
      return
    }

    const payloadStartOffset = 12 + 4 * csrcCount,
      nalUnitHeader = message.readUInt8(payloadStartOffset),
      forbidden = (nalUnitHeader & parseInt('10000000', 2)) >>> 7, // Must be zero.
      nri = (nalUnitHeader & parseInt('01100000', 2)) >>> 5
    let nalType = (nalUnitHeader & parseInt('00011111', 2)) >>> 0

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
      const fragmentHeader = message.readUInt8(payloadStartOffset + 1),
        start = (fragmentHeader & parseInt('10000000', 2)) >>> 7,
        reserved = (fragmentHeader & parseInt('00100000', 2)) >>> 5
      if (reserved !== 0) {
        return
      }
      nalType = (fragmentHeader & parseInt('00011111', 2)) >>> 0
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
