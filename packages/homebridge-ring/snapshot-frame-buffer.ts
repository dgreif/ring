const jpegStartMarker = Buffer.from([0xff, 0xd8]),
  jpegEndMarker = Buffer.from([0xff, 0xd9]),
  maxSnapshotBufferSize = 10 * 1024 * 1024

export class SnapshotFrameBuffer {
  private buffer?: Buffer
  private readonly onFrame: (frame: Buffer) => void

  constructor(onFrame: (frame: Buffer) => void) {
    this.onFrame = onFrame
  }

  append(chunk: Buffer) {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk

    let start = this.buffer.indexOf(jpegStartMarker),
      end = this.buffer.indexOf(jpegEndMarker, start + 2)

    while (start >= 0 && end >= 0) {
      if (end + 2 - start <= maxSnapshotBufferSize) {
        this.onFrame(this.buffer.subarray(start, end + 2))
      }
      this.buffer = this.buffer.subarray(end + 2)
      start = this.buffer.indexOf(jpegStartMarker)
      end = this.buffer.indexOf(jpegEndMarker, start + 2)
    }

    if (start < 0 || this.buffer.length > maxSnapshotBufferSize) {
      this.buffer =
        this.buffer.at(-1) === jpegStartMarker[0]
          ? this.buffer.subarray(-1)
          : undefined
    } else if (start > 0) {
      this.buffer = this.buffer.subarray(start)
    }
  }
}
