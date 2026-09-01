import type { RingIntercom } from 'ring-client-api'
import { StreamingSession } from 'ring-client-api/streaming/streaming-session'
import { logInfo } from 'ring-client-api/util'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, parse } from 'path'
import { fileURLToPath } from 'url'

// WebrtcConnection is NOT in ring-client-api's `exports` field, so it cannot be
// imported by package specifier. A relative path into node_modules does not work
// either: depending on whether npm workspaces hoist or not, the package lands in
// different places (under homebridge-ring/node_modules/ in a real Homebridge
// install, usually at the root in a monorepo).
// So we ask Node where the package actually is and walk from there.
const ringClientApiLib = dirname(
    createRequire(import.meta.url).resolve('ring-client-api'),
  ),
  { WebrtcConnection } = (await import(
    join(ringClientApiLib, 'streaming', 'webrtc-connection.js')
  )) as { WebrtcConnection: any }

// The still image lives at the package root, but this module runs from two different
// depths: `intercom-camera.ts` at the root when running from source or tests, and
// `lib/intercom-camera.js` once built. A fixed '../media' resolves correctly in only
// one of them, and getting it wrong is invisible until runtime: ffmpeg finds no input,
// HomeKit gets no video and tears the session down, taking the audio with it.
// So walk up to the directory that owns package.json and resolve from there.
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir || dir === parse(dir).root) {
      // Should be unreachable in a published package; fall back to the old behavior
      // rather than throwing while Homebridge is starting up.
      return startDir
    }
    dir = parent
  }
}

const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)))

/**
 * Wraps a RingIntercom so it can be used as a HomeKit camera.
 *
 * WHY THIS EXISTS
 * The Ring Intercom has no camera, so the plugin never gave it a video accessory and
 * therefore no audio either: in HomeKit you could open the door but not hear or speak.
 * The audio channel IS available though. Verified on 2026-09-01 against Ring's
 * servers: the intercom is a "doorbot" just like the cameras, the streaming ticket is
 * generic (it carries no device id), and negotiating with the intercom's `doorbot_id`
 * makes the server answer with
 *
 *     m=audio 9 UDP/TLS/RTP/SAVPF 96
 *     a=sendrecv
 *
 * that is: audio in both directions and no video track. Listen and talk.
 *
 * HOW THE MISSING VIDEO IS HANDLED
 * HomeKit will not accept a "camera" without video, so we serve a still image that
 * ships with the plugin (`media/intercom-still.jpg`). It is not drawn or computed: it
 * is a file, always the same one, with no dependency on system fonts.
 *
 * The surface exposed here is the minimum consumed by CameraSource (name, isOffline,
 * getSnapshot, hasSnapshotWithinLifetime, snapshotsAreBlocked, snapshotLifeTime,
 * startLiveCall), StreamingSession (name) and WebrtcConnection (id, name,
 * isRingEdgeEnabled) — taken from reading their code, not assumed.
 */
export class IntercomCamera {
  public readonly snapshotsAreBlocked = false
  public readonly snapshotLifeTime = 0
  public readonly isRingEdgeEnabled = false
  public readonly ffmpegPath: string
  public readonly speakerGainDb: number
  public readonly micGainDb: number

  private snapshot: Buffer | null = null
  private readonly stillPath = join(packageRoot, 'media', 'intercom-still.jpg')

  // Fields are declared separately: this repo's tsconfig sets `erasableSyntaxOnly`,
  // which forbids parameter properties (`private readonly x` in the constructor).
  private readonly intercom: RingIntercom
  public readonly restClient: { request: <T>(options: any) => Promise<T> }

  constructor(
    intercom: RingIntercom,
    restClient: { request: <T>(options: any) => Promise<T> },
    ffmpegPath?: string,
    speakerGainDb?: number,
    micGainDb?: number,
  ) {
    this.intercom = intercom
    this.restClient = restClient
    this.ffmpegPath = ffmpegPath || 'ffmpeg'
    // Careful with Number(): Number(null) is 0 and so is Number(''), so an empty
    // config value slipped through as "0 dB gain" instead of falling back to the
    // default — the user lost their gain with no idea why. A test caught it.
    // An EXPLICIT 0 is valid and must be honored.
    this.speakerGainDb = IntercomCamera.gain(speakerGainDb, 10)
    this.micGainDb = IntercomCamera.gain(micGainDb, 12)
  }

  private static gain(value: unknown, fallback: number): number {
    if (value === null || value === undefined || value === '') {
      return fallback
    }
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  get id() {
    return this.intercom.id
  }
  get name() {
    return this.intercom.name
  }
  get isOffline() {
    return this.intercom.isOffline
  }

  hasSnapshotWithinLifetime() {
    return Boolean(this.snapshot)
  }

  /** Still image shipped with the plugin. Read once, then kept in memory. */
  async getSnapshot() {
    if (!this.snapshot) {
      this.snapshot = await readFile(this.stillPath)
    }
    return this.snapshot
  }

  /** ffmpeg needs the file on disk, not the buffer. */
  getSnapshotPath() {
    return this.stillPath
  }

  /**
   * Opens the audio call. Same path as a camera: generic ticket, then a WebRTC
   * negotiation that identifies the device by its doorbot_id.
   */
  async startLiveCall() {
    const ticket = await this.restClient.request<{ ticket: string }>({
      method: 'POST',
      url: 'https://app.ring.com/api/v1/clap/ticket/request/signalsocket',
    })
    logInfo(`Opening audio to ${this.name}`)
    const connection = new WebrtcConnection(ticket.ticket, this as any, {})
    return new StreamingSession(this as any, connection)
  }
}
