/**
 * Reassembles complete H.264 RTP access units and rejects damaged video before
 * it is sent to ffmpeg for snapshot decoding.
 */
import { H264RtpPayload, type RtpPacket } from 'werift'

const maxFrameSize = 10 * 1024 * 1024

export class SnapshotH264FrameBuffer {
  private timestamp?: number
  private sequenceNumber?: number
  private parts: Buffer[] = []
  private fragment?: Buffer
  private size = 0
  private damaged = false
  private readonly onDiscard: () => void

  constructor(onDiscard: () => void) {
    this.onDiscard = onDiscard
  }

  private resetFrame() {
    this.parts = []
    this.fragment = undefined
    this.size = 0
    this.damaged = false
    this.timestamp = undefined
  }

  append({ header, payload }: RtpPacket): Buffer | undefined {
    if (this.timestamp !== undefined && this.timestamp !== header.timestamp) {
      if (this.parts.length || this.fragment || this.damaged) {
        this.onDiscard()
      }
      this.resetFrame()
    }
    this.timestamp = header.timestamp

    if (
      this.sequenceNumber !== undefined &&
      header.sequenceNumber !== (this.sequenceNumber + 1) % 65536
    ) {
      this.damaged = true
    }
    this.sequenceNumber = header.sequenceNumber

    if (!this.damaged) {
      const nalType = payload[0] & 0x1f,
        isFragment = nalType === 28,
        startsFragment = isFragment && Boolean(payload[1] & 0x80),
        invalidFragment =
          isFragment &&
          (startsFragment
            ? this.fragment !== undefined
            : this.fragment === undefined)

      if (
        !payload.length ||
        (isFragment && payload.length < 3) ||
        invalidFragment ||
        (!isFragment && this.fragment)
      ) {
        this.damaged = true
      } else {
        let nal: H264RtpPayload
        try {
          nal = H264RtpPayload.deSerialize(payload, this.fragment)
        } catch (error) {
          this.damaged = true
          throw error
        }
        this.fragment = nal.fragment
        if (nal.payload) {
          this.size += nal.payload.length
          this.parts.push(nal.payload)
        }
        if (this.size + (this.fragment?.length ?? 0) > maxFrameSize) {
          this.damaged = true
        }
      }
    }

    if (!header.marker) {
      return
    }

    const frame =
      !this.damaged && !this.fragment && this.parts.length
        ? Buffer.concat(this.parts, this.size)
        : undefined
    if (!frame) {
      this.onDiscard()
    }
    this.resetFrame()
    return frame
  }
}
