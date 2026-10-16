import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import { SnapshotH264FrameBuffer } from '../lib/snapshot-h264-frame-buffer.js'

function packet(sequenceNumber, timestamp, marker, bytes) {
  return {
    header: { sequenceNumber, timestamp, marker },
    payload: Buffer.from(bytes),
  }
}

test('assembles a complete fragmented keyframe across sequence wrap', () => {
  let discarded = 0
  const frames = new SnapshotH264FrameBuffer(() => discarded++)

  assert.equal(
    frames.append(packet(65534, 100, false, [0x7c, 0x85, 1])),
    undefined,
  )
  assert.equal(
    frames.append(packet(65535, 100, false, [0x7c, 0x05, 2])),
    undefined,
  )
  assert.deepEqual(
    frames.append(packet(0, 100, true, [0x7c, 0x45, 3])),
    Buffer.from([0, 0, 0, 1, 0x65, 1, 2, 3]),
  )
  assert.equal(discarded, 0)
})

test('assembles parameter sets and a fragmented keyframe in one access unit', () => {
  let discarded = 0
  const frames = new SnapshotH264FrameBuffer(() => discarded++)

  assert.equal(frames.append(packet(20, 400, false, [0x67, 1])), undefined)
  assert.equal(frames.append(packet(21, 400, false, [0x68, 2])), undefined)
  assert.equal(
    frames.append(packet(22, 400, false, [0x7c, 0x85, 3])),
    undefined,
  )
  assert.deepEqual(
    frames.append(packet(23, 400, true, [0x7c, 0x45, 4])),
    Buffer.from([
      0, 0, 0, 1, 0x67, 1, 0, 0, 0, 1, 0x68, 2, 0, 0, 0, 1, 0x65, 3, 4,
    ]),
  )
  assert.equal(discarded, 0)
})

test('drops missing and orphaned fragments rather than emitting corrupted video', () => {
  let discarded = 0
  const frames = new SnapshotH264FrameBuffer(() => discarded++)

  frames.append(packet(10, 100, false, [0x7c, 0x85, 1]))
  assert.equal(frames.append(packet(12, 100, true, [0x7c, 0x45, 3])), undefined)
  assert.equal(frames.append(packet(13, 200, true, [0x7c, 0x45, 4])), undefined)
  assert.deepEqual(
    frames.append(packet(14, 300, true, [0x65, 5])),
    Buffer.from([0, 0, 0, 1, 0x65, 5]),
  )
  assert.equal(discarded, 2)
})

test('drops the first frame after a packet gap and resumes at a complete frame', () => {
  let discarded = 0
  const frames = new SnapshotH264FrameBuffer(() => discarded++)

  assert.deepEqual(
    frames.append(packet(1, 100, true, [0x65, 1])),
    Buffer.from([0, 0, 0, 1, 0x65, 1]),
  )
  assert.equal(frames.append(packet(3, 200, true, [0x65, 2])), undefined)
  assert.deepEqual(
    frames.append(packet(4, 300, true, [0x65, 3])),
    Buffer.from([0, 0, 0, 1, 0x65, 3]),
  )
  assert.equal(discarded, 1)
})

test('drops unfinished and oversized access units', () => {
  let discarded = 0
  const frames = new SnapshotH264FrameBuffer(() => discarded++)

  frames.append(packet(1, 100, false, [0x65, 1]))
  assert.deepEqual(
    frames.append(packet(2, 200, true, [0x65, 2])),
    Buffer.from([0, 0, 0, 1, 0x65, 2]),
  )
  assert.equal(
    frames.append(
      packet(
        3,
        300,
        true,
        Buffer.concat([Buffer.from([0x65]), Buffer.alloc(10 * 1024 * 1024)]),
      ),
    ),
    undefined,
  )
  assert.equal(discarded, 2)
})
