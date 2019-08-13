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

export default class PacketParser {
  // part = Buffer.from([])
  packetReceived(message: Buffer) {
    const row0 = message.readUInt32BE(0),
      // version = (row0 & parseInt('11000000000000000000000000000000', 2)) >>> 30,
      // padding = (row0 & parseInt('00100000000000000000000000000000', 2)) >>> 29,
      // extension =
      //   (row0 & parseInt('00010000000000000000000000000000', 2)) >>> 28,
      csrcCount =
        (row0 & parseInt('00001111000000000000000000000000', 2)) >>> 24,
      // marker = (row0 & parseInt('00000000100000000000000000000000', 2)) >>> 23,
      payloadType =
        (row0 & parseInt('00000000011111110000000000000000', 2)) >>> 16,
      // sequenceNum =
      //   (row0 & parseInt('00000000000000001111111111111111', 2)) >>> 0,
      isH264 = payloadType === 99 // Defined in our SIP INVITE.
    if (!isH264) {
      return
    }

    const //timestamp = message.readUInt32BE(4),
      // ssrc = message.readUInt32BE(8),
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
      return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x01]),
        message.subarray(payloadStartOffset)
      ])
    } else if (nalType === 24) {
      return // STAP-A ignore for now.
    } else if (nalType === 28) {
      // FU-A
      // eventually: check that we didn't drop pieces of the fragment.
      const fragmentHeader = message.readUInt8(payloadStartOffset + 1),
        start = (fragmentHeader & parseInt('10000000', 2)) >>> 7,
        // end = (fragmentHeader & parseInt('01000000', 2)) >>> 6,
        reserved = (fragmentHeader & parseInt('00100000', 2)) >>> 5
      if (reserved !== 0) {
        return
      }
      const fragmentNalType = (fragmentHeader & parseInt('00011111', 2)) >>> 0
      if (start === 1) {
        const reconstructedHeader =
          (forbidden << 7) | (nri << 5) | (fragmentNalType << 0)

        return Buffer.concat([
          Buffer.from([0x00, 0x00, 0x00, 0x01]),
          Buffer.from([reconstructedHeader]),
          message.subarray(payloadStartOffset + 2)
        ])
      }
      return message.subarray(payloadStartOffset + 2)
    }
    return
  }
}
