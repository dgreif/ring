// Session state shared by the CLI and the supervisor process, plus the
// per-checkout resources (ports, PIN, storage, plugin shim) and the live lock.
import { createHash, randomInt } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError } from './output.ts'
import {
  checkoutDir,
  checkoutHash,
  evidenceRoot,
  heartbeatFile,
  homebridgeRingDir,
  liveLockFile,
  pluginShimDir,
  portBlockSize,
  preferredPortBase,
  repoRoot,
  sessionFile,
} from './paths.ts'
import type { RestoreReport } from './restore.ts'

export type Mode = 'live' | 'fake'
export type SessionStatus =
  | 'starting'
  | 'ready'
  | 'stopping'
  | 'stopped'
  | 'failed'

export interface Session {
  mode: Mode
  runId: string
  runDir: string
  storageDir: string
  portBase: number
  bridgePort: number
  sinkPort: number
  externalPorts: { start: number; end: number }
  pin: string
  username: string
  scenario?: string
  debug: boolean
  idleMinutes: number
  timeoutSeconds: number
  platformOverrides: Record<string, unknown>
  supervisorPid?: number
  homebridgePid?: number
  status: SessionStatus
  startedAt: string
  readyAt?: string
  stoppedAt?: string
  stopReason?: string
  error?: string
  errorNext?: string[]
  logTail?: string[]
  locations?: { id: string; name: string }[]
  accessoryCount?: number
  startupRestore?: RestoreReport
  shutdownRestore?: RestoreReport
}

function writeJsonAtomic(file: string, value: unknown, mode = 0o600) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode })
  renameSync(tmp, file)
}

export function readSession(): Session | undefined {
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf8'))
  } catch {
    return undefined
  }
}

export function writeSession(session: Session) {
  writeJsonAtomic(sessionFile, session)
}

export function updateSession(patch: Partial<Session>) {
  const current = readSession()
  if (!current) {
    throw new Error('No session file to update')
  }
  const next = { ...current, ...patch }
  writeSession(next)
  return next
}

export function isAlive(pid: number | undefined) {
  if (!pid) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (e: any) {
    return e?.code === 'EPERM'
  }
}

export function isSessionActive(session: Session | undefined) {
  return Boolean(
    session &&
      (session.status === 'starting' ||
        session.status === 'ready' ||
        session.status === 'stopping') &&
      isAlive(session.supervisorPid),
  )
}

export function touchHeartbeat() {
  mkdirSync(checkoutDir, { recursive: true })
  writeFileSync(heartbeatFile, String(Date.now()))
}

export function heartbeatAgeMs() {
  try {
    return Date.now() - Number(readFileSync(heartbeatFile, 'utf8'))
  } catch {
    return Infinity
  }
}

function isPortFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

export async function allocatePortBlock() {
  const preferred = preferredPortBase(),
    first = 42000,
    slots = 300
  for (let attempt = 0; attempt < slots; attempt++) {
    const slot = ((preferred - first) / portBlockSize + attempt * 7) % slots,
      base = first + slot * portBlockSize,
      ports = Array.from({ length: portBlockSize }, (_, i) => base + i),
      free = await Promise.all(ports.map(isPortFree))
    if (free.every(Boolean)) {
      return base
    }
  }
  throw new CliError('Could not find 32 free consecutive ports on 127.0.0.1', {
    code: 'no-ports',
    next: ['Run `ring-ctl cleanup` to stop stray Homebridge processes.'],
  })
}

const trivialPins = new Set([
  '00000000',
  '11111111',
  '22222222',
  '33333333',
  '44444444',
  '55555555',
  '66666666',
  '77777777',
  '88888888',
  '99999999',
  '12345678',
  '87654321',
])

export function generatePin() {
  for (;;) {
    const digits = Array.from({ length: 8 }, () => randomInt(10)).join('')
    if (!trivialPins.has(digits)) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    }
  }
}

// Stable per checkout + mode, so Homebridge's accessory cache carries over
// between launches just like a real install. Locally administered unicast.
export function bridgeUsernameFor(mode: Mode) {
  const bytes = createHash('sha256')
    .update(`${checkoutHash}:${mode}`)
    .digest()
    .subarray(0, 6)
  bytes[0] = (bytes[0] & 0xfe) | 0x02
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':')
}

export function newRunDir(mode: Mode, runId: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
    runDir = join(evidenceRoot, `${stamp}-${mode}-${runId}`)
  mkdirSync(runDir, { recursive: true })
  return runDir
}

// Homebridge only loads a plugin's built `main`. The shim points it at the
// TypeScript sources so verification always runs the code on disk.
export function preparePluginShim() {
  const source = JSON.parse(
    readFileSync(join(homebridgeRingDir, 'package.json'), 'utf8'),
  )
  rmSync(pluginShimDir, { recursive: true, force: true })
  mkdirSync(pluginShimDir, { recursive: true })
  writeFileSync(
    join(pluginShimDir, 'package.json'),
    JSON.stringify(
      {
        name: source.name,
        version: source.version,
        description: `Shim that loads ${homebridgeRingDir} from source`,
        type: 'module',
        main: 'index.js',
        engines: source.engines,
        keywords: source.keywords,
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(pluginShimDir, 'index.js'),
    `export { default } from ${JSON.stringify(
      pathToFileURL(join(homebridgeRingDir, 'index.ts')).href,
    )}\n`,
  )
  return pluginShimDir
}

export function writeHomebridgeConfig(
  session: Session,
  platformConfig: Record<string, unknown>,
) {
  mkdirSync(session.storageDir, { recursive: true })
  const config = {
    bridge: {
      name: `Ring Verify ${checkoutHash.slice(0, 4)} ${session.mode}`,
      username: session.username,
      port: session.bridgePort,
      pin: session.pin,
      bind: ['127.0.0.1'],
    },
    ports: session.externalPorts,
    accessories: [],
    platforms: [{ platform: 'Ring', name: 'Ring', ...platformConfig }],
  }
  writeJsonAtomic(join(session.storageDir, 'config.json'), config)
}

export function readPlatformConfig(storageDir: string) {
  try {
    const config = JSON.parse(
      readFileSync(join(storageDir, 'config.json'), 'utf8'),
    )
    return config.platforms?.find((p: any) => p.platform === 'Ring')
  } catch {
    return undefined
  }
}

export interface LiveLock {
  pid: number
  runId: string
  repoRoot: string
  checkoutHash: string
  startedAt: string
}

export function readLiveLock(): LiveLock | undefined {
  try {
    return JSON.parse(readFileSync(liveLockFile, 'utf8'))
  } catch {
    return undefined
  }
}

// Only one checkout may drive the real Ring account at a time. Two Homebridge
// instances racing each other (and each other's restores) on real devices
// would make every result untrustworthy.
export function acquireLiveLock(runId: string, pid: number) {
  const existing = readLiveLock()
  if (
    existing &&
    existing.checkoutHash !== checkoutHash &&
    isAlive(existing.pid)
  ) {
    throw new CliError('Another checkout is already using live mode', {
      code: 'live-in-use',
      details: existing,
      next: [
        `Live mode is in use by ${existing.repoRoot} since ${existing.startedAt}.`,
        'Use fake mode (`ring-ctl launch fake`) for this checkout, or wait for that session to stop (it stops itself after its idle timeout).',
      ],
    })
  }
  writeJsonAtomic(liveLockFile, {
    pid,
    runId,
    repoRoot,
    checkoutHash,
    startedAt: new Date().toISOString(),
  } satisfies LiveLock)
  return existing
}

export function releaseLiveLock(runId: string) {
  const existing = readLiveLock()
  if (existing && existing.runId === runId) {
    rmSync(liveLockFile, { force: true })
  }
}
