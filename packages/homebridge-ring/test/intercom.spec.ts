// Tests for the Ring Intercom support.
//
// These are not filler: every one of them covers something that actually broke during
// development, or that — if it breaks — leaves the user with no audio and no visible
// error anywhere to explain why.
//
// The regression tests read the source text rather than executing the pipeline,
// because the failures they guard against are ffmpeg/streaming arguments whose effect
// only shows up on a real device. Asserting on the arguments is the part that can be
// checked deterministically in CI.
import { describe, expect, it } from 'vitest'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { IntercomCamera } from '../intercom-camera.ts'

const packageDir = fileURLToPath(new URL('..', import.meta.url)),
  stillPath = join(packageDir, 'media', 'intercom-still.jpg'),
  sourcePath = join(packageDir, 'intercom-camera-source.ts'),
  fakeIntercom = { id: 999, name: 'Test Intercom', isOffline: false, data: {} },
  fakeRest = { request: () => Promise.resolve({ ticket: 'x' }) },
  // The constructor only touches these two, so the fakes can stay this small
  makeCamera = (...gains: unknown[]) =>
    new IntercomCamera(
      fakeIntercom as never,
      fakeRest as never,
      '/usr/bin/ffmpeg',
      ...(gains as [number?, number?]),
    ),
  readSource = () => readFile(sourcePath, 'utf8')

describe('Ring Intercom', () => {
  describe('still image', () => {
    it('ships with the plugin, so nothing has to be generated at runtime', async () => {
      expect(existsSync(stillPath)).toBe(true)

      const buffer = await readFile(stillPath)
      // Sent on every preview, so it has to stay small
      expect(buffer.length).toBeGreaterThan(500)
      expect(buffer.length).toBeLessThan(20000)
      // JPEG magic number
      expect(buffer[0]).toEqual(0xff)
      expect(buffer[1]).toEqual(0xd8)
    })

    it('serves the bundled file rather than a generated image', async () => {
      expect(await makeCamera().getSnapshot()).toEqual(
        await readFile(stillPath),
      )
    })

    it('caches the snapshot instead of hitting the disk again', async () => {
      const camera = makeCamera()
      expect(await camera.getSnapshot()).toBe(await camera.getSnapshot())
    })

    it('gives ffmpeg the path of the bundled file', () => {
      expect(makeCamera().getSnapshotPath()).toMatch(
        /media\/intercom-still\.jpg$/,
      )
    })
  })

  describe('gain configuration', () => {
    it('falls back to sensible defaults', () => {
      const camera = makeCamera()
      expect(camera.micGainDb).toEqual(12)
      expect(camera.speakerGainDb).toEqual(10)
    })

    it('honors configured values, including an explicit 0', () => {
      const camera = makeCamera(18, 20)
      expect(camera.speakerGainDb).toEqual(18)
      expect(camera.micGainDb).toEqual(20)

      // 0 is a legitimate choice (leave the level alone) and must not be treated as
      // "unset". Number(null) and Number('') are both 0, so an empty config value used
      // to slip through as 0 dB instead of falling back — silently killing the gain.
      const noGain = makeCamera(0, 0)
      expect(noGain.speakerGainDb).toEqual(0)
      expect(noGain.micGainDb).toEqual(0)
    })

    it('falls back rather than breaking on an invalid value', () => {
      const camera = makeCamera('loud', null)
      expect(camera.speakerGainDb).toEqual(10)
      expect(camera.micGainDb).toEqual(12)
    })
  })

  it('never leaves ffmpegPath undefined', () => {
    // getFfmpegPath() returns undefined unless it has been configured, and spawn then
    // throws "The file argument must be of type string", which surfaces to the user
    // only as an accessory that is "not responding".
    const camera = new IntercomCamera(
      fakeIntercom as never,
      fakeRest as never,
      undefined,
    )
    expect(typeof camera.ffmpegPath).toEqual('string')
    expect(camera.ffmpegPath.length).toBeGreaterThan(0)
  })

  describe('streaming regressions', () => {
    it('encodes video at no less than 10 fps', async () => {
      // 5 fps was tried to save CPU. HomeKit started cutting the session after a few
      // seconds and the audio went with it: ~25 KiB down to 2 KiB per session. The
      // saving was 1.3 percentage points of one core.
      const fps = (await readSource()).match(/'-r',\s*'(\d+)'/)
      expect(fps).not.toBeNull()
      expect(Number(fps![1])).toBeGreaterThanOrEqual(10)
    })

    it('takes the intercom out of stealth mode when the stream starts', async () => {
      // Without activateCameraSpeaker() up front, the intercom stays in stealth mode
      // and transmits digital silence (-92 dB), call or no call. This was the reason
      // nothing could be heard at all.
      const source = await readSource(),
        activate = source.slice(source.indexOf('async activate('))
      expect(activate).toContain('activateCameraSpeaker')
    })

    it('regenerates timestamps on incoming audio', async () => {
      // Without genpts/aresample, ffmpeg reports "Queue input is backward in time" and
      // HomeKit discards the audio even though the packets arrive fine.
      const source = await readSource()
      expect(source).toContain('genpts')
      expect(source).toContain('aresample')
    })

    it('limits the audio it boosts, in both directions', async () => {
      // Boosting without a limiter clips the peaks, which is exactly where the
      // consonants that make a word intelligible live.
      const filters = (await readSource()).match(/aresample=[^`']*/)
      expect(filters).not.toBeNull()
      expect(filters![0]).toContain('volume=')
      expect(filters![0]).toContain('alimiter')
    })

    it('does not forward the video Ring sends for an intercom', async () => {
      // That channel carries no valid H.264 for an intercom. Forwarding it made
      // HomeKit tear down the whole session, audio included.
      const source = await readSource(),
        activate = source.slice(
          source.indexOf('async activate('),
          source.indexOf('    stop()'),
        )
      expect(activate).not.toMatch(/onVideoRtp\.subscribe/)
    })
  })
})
