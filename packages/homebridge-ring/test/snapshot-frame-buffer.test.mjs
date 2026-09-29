import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import { SnapshotFrameBuffer } from '../lib/snapshot-frame-buffer.js'

const start = Buffer.from([0xff, 0xd8]),
  end = Buffer.from([0xff, 0xd9]),
  maxSize = 10 * 1024 * 1024

test('assembles frames across chunks and keeps the latest', () => {
  const frames = [],
    buffer = new SnapshotFrameBuffer((frame) => frames.push(frame))

  buffer.append(Buffer.from([0x00, 0xff]))
  buffer.append(Buffer.from([0xd8, 0x01, 0xff]))
  buffer.append(Buffer.from([0xd9, 0xff, 0xd8, 0x02, 0xff, 0xd9]))

  assert.deepEqual(frames, [
    Buffer.from([0xff, 0xd8, 0x01, 0xff, 0xd9]),
    Buffer.from([0xff, 0xd8, 0x02, 0xff, 0xd9]),
  ])
})

test('bounds an incomplete frame and recovers for the next frame', () => {
  const frames = [],
    buffer = new SnapshotFrameBuffer((frame) => frames.push(frame)),
    nextFrame = Buffer.concat([start, Buffer.from([0x42]), end])

  buffer.append(Buffer.concat([start, Buffer.alloc(maxSize)]))
  buffer.append(nextFrame)

  assert.deepEqual(frames, [nextFrame])
})

test('rejects oversized complete frames but accepts the size limit', () => {
  const frames = [],
    buffer = new SnapshotFrameBuffer((frame) => frames.push(frame)),
    exactLimit = Buffer.concat([start, Buffer.alloc(maxSize - 4), end])

  buffer.append(Buffer.concat([start, Buffer.alloc(maxSize - 3), end]))
  buffer.append(exactLimit)

  assert.deepEqual(frames, [exactLimit])
})
