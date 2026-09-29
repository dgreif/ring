import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { clearTimeout, setImmediate, setTimeout } from 'node:timers'
import { defaultFfmpegPath } from '@homebridge/camera-utils'
import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs'
import { CameraSource } from '../lib/camera-source.js'
import { setHap } from '../lib/hap.js'

setHap({ CameraController: class {} })

function makeCamera(operatingOnBattery = false, blocked = true) {
  const pending = [],
    onData = new BehaviorSubject({ blocked, offline: false }),
    camera = {
      name: 'Test Camera',
      onData,
      get isOffline() {
        return onData.value.offline
      },
      get snapshotsAreBlocked() {
        return onData.value.blocked
      },
      operatingOnBattery,
      startLiveCall() {
        return new Promise((resolve) => pending.push(resolve))
      },
    }
  return { camera, pending }
}

test('startup refresh waits for Ring to report blocked snapshots online', async () => {
  const { camera, pending } = makeCamera(false, false),
    source = new CameraSource(camera, true)

  assert.equal(pending.length, 0)
  camera.onData.next({ blocked: true, offline: true })
  assert.equal(pending.length, 0)
  camera.onData.next({ blocked: true, offline: false })
  assert.equal(pending.length, 1)
  await cancelPendingRefresh(source, pending)
})

async function cancelPendingRefresh(source, pending) {
  source.backgroundSnapshotVersion++
  let stopped = 0
  pending.shift()({ stop: () => stopped++ })
  await source.backgroundSnapshotPromise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(stopped, 1)
}

test('blocked tile refresh is opt-in, nonblocking, and deduplicated', async () => {
  const { camera, pending } = makeCamera(),
    disabled = new CameraSource(camera)

  await disabled.getCurrentSnapshot()
  assert.equal(pending.length, 0)

  const enabled = new CameraSource(camera, true)
  assert.equal(pending.length, 1)
  const initial = await enabled.getCurrentSnapshot()
  assert.equal(pending.length, 1)
  assert.ok(initial.length > 0)

  const frame = Buffer.from([0xff, 0xd8, 0x01, 0xff, 0xd9])
  enabled.cacheLiveStreamSnapshot(frame)
  assert.equal(enabled.getCurrentSnapshot(), frame)
  assert.equal(pending.length, 1)

  await cancelPendingRefresh(enabled, pending)
  assert.equal(enabled.getCurrentSnapshot(), frame)
  assert.equal(pending.length, 0)

  enabled.lastBackgroundSnapshotAttempt = Date.now() - 30001
  enabled.liveStreamSnapshotAt = Date.now() - 30001
  assert.equal(enabled.getCurrentSnapshot(), frame)
  assert.equal(pending.length, 1)
  await cancelPendingRefresh(enabled, pending)
})

test('battery refresh is capped at 60 seconds and stale frames expire', async () => {
  const { camera, pending } = makeCamera(true),
    source = new CameraSource(camera, true),
    frame = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

  assert.equal(pending.length, 1)
  await cancelPendingRefresh(source, pending)
  source.cacheLiveStreamSnapshot(frame)
  source.lastBackgroundSnapshotAttempt = Date.now() - 30001
  source.liveStreamSnapshotAt = Date.now() - 30001
  assert.equal(source.getCurrentSnapshot(), frame)
  assert.equal(pending.length, 0)

  source.lastBackgroundSnapshotAttempt = Date.now() - 60001
  source.liveStreamSnapshotAt = Date.now() - 60001
  assert.equal(source.getCurrentSnapshot(), frame)
  assert.equal(pending.length, 1)
  await cancelPendingRefresh(source, pending)

  source.liveStreamSnapshotAt = Date.now() - 5 * 60 * 1000 - 1
  const stale = await source.getCurrentSnapshot()
  assert.notDeepEqual(stale, frame)
})

test('background live call captures a frame and stops', async () => {
  const video = spawnSync(
    defaultFfmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=64x64:r=10:d=8',
      '-c:v',
      'libx264',
      '-x264-params',
      'bframes=0:keyint=10:min-keyint=10:scenecut=0',
      '-f',
      'h264',
      'pipe:1',
    ],
    { maxBuffer: 1024 * 1024 },
  )
  assert.equal(video.status, 0, video.stderr.toString())

  const onVideoRtp = new Subject(),
    onCallEnded = new ReplaySubject(1),
    liveCall = {
      onVideoRtp,
      onCallEnded,
      stopped: false,
      addSubscriptions() {},
      requestKeyFrame() {},
      stop() {
        this.stopped = true
        onCallEnded.next()
      },
    },
    camera = {
      name: 'Test Camera',
      onData: new BehaviorSubject({}),
      isOffline: false,
      snapshotsAreBlocked: true,
      operatingOnBattery: false,
      async startLiveCall() {
        return liveCall
      },
    },
    source = new CameraSource(camera, true)

  let cachedFrames = 0
  const cacheSnapshot = source.cacheLiveStreamSnapshot.bind(source)
  source.cacheLiveStreamSnapshot = (frame) => {
    cachedFrames++
    cacheSnapshot(frame)
  }

  let responded = false
  const firstSnapshot = new Promise((resolve, reject) => {
    source.handleSnapshotRequest({}, (error, frame) => {
      responded = true
      if (error) {
        reject(error)
      } else {
        resolve(frame)
      }
    })
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(responded, false)

  const nalUnits = []
  let offset = 0
  for (let i = 0; i < video.stdout.length - 3; i++) {
    if (video.stdout[i] || video.stdout[i + 1]) {
      continue
    }
    const startSize =
      video.stdout[i + 2] === 1
        ? 3
        : video.stdout[i + 2] === 0 && video.stdout[i + 3] === 1
        ? 4
        : 0
    if (startSize) {
      if (offset) {
        nalUnits.push(video.stdout.subarray(offset, i))
      }
      offset = i + startSize
      i += startSize - 1
    }
  }
  nalUnits.push(video.stdout.subarray(offset))
  assert.ok(nalUnits.length > 70)
  onVideoRtp.next({
    header: { sequenceNumber: 0, timestamp: 1, marker: true },
    payload: Buffer.from([0x7c, 0x45, 0xff]),
  })
  for (const [sequenceNumber, payload] of nalUnits.entries()) {
    onVideoRtp.next({
      header: {
        sequenceNumber: sequenceNumber + 1,
        timestamp: sequenceNumber * 3000,
        marker: true,
      },
      payload,
    })
  }

  const refresh = source.backgroundSnapshotPromise
  let timer
  try {
    await Promise.race([
      refresh,
      new Promise(
        (_, reject) =>
          (timer = setTimeout(
            () => reject(new Error('No frame captured')),
            5000,
          )),
      ),
    ])
    assert.equal(liveCall.stopped, true)
    assert.ok(source.liveStreamSnapshot?.length > 0)
    const decoded = spawnSync(
      defaultFfmpegPath,
      [
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-i',
        'pipe:0',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { input: source.liveStreamSnapshot },
    )
    assert.equal(decoded.status, 0, decoded.stderr.toString())
    assert.equal(decoded.stdout.length, 64 * 64 * 3)
    assert.ok(decoded.stdout[0] > 200)
    assert.ok(decoded.stdout[1] < 80)
    assert.ok(decoded.stdout[2] < 80)
    assert.deepEqual(await firstSnapshot, source.liveStreamSnapshot)
    assert.equal(source.getCurrentSnapshot(), source.liveStreamSnapshot)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(cachedFrames, 1)
  } finally {
    clearTimeout(timer)
    liveCall.stop()
    await refresh.catch(() => {})
  }
})
