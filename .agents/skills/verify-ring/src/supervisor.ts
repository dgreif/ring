// Detached process started by `ring-ctl launch`. It owns everything that has
// to outlive a single CLI call: the fake cloud (or the live block sink), the
// Homebridge child, readiness detection, token sync, the idle watchdog and
// the restore that runs on every kind of shutdown.
import { type ChildProcess, spawn } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  fakeRefreshToken,
  loadScenario,
  startFakeRing,
} from '../fake-ring/server.ts'
import {
  discoverExternalPorts,
  type HapTopology,
  loadAccessories,
} from './hap.ts'
import { pendingWrites } from './journal.ts'
import { delay } from './output.ts'
import {
  homebridgeBin,
  liveDir,
  liveSystemIdFile,
  liveTokenFile,
  pluginShimDir,
  skillDir,
} from './paths.ts'
import { clearPermits } from './policy.ts'
import { captureBaseline, type RestoreReport, restoreLive } from './restore.ts'
import {
  heartbeatAgeMs,
  isAlive,
  readPlatformConfig,
  readSession,
  releaseLiveLock,
  type Session,
  updateSession,
  writeHomebridgeConfig,
} from './session.ts'

const fatalPatterns = [
  /Failed to fetch oauth token from Ring[^\n]*/,
  /Refresh token is not valid[^\n]*/,
  /2-factor authentication[^\n]*/,
  /Error connecting to API/,
  /No plugin was found for the platform[^\n]*/,
  /There was a problem reading your config\.json file[^\n]*/,
  /EADDRINUSE[^\n]*/,
  /does not export an initializer function[^\n]*/,
]

const initial = readSession()
if (!initial) {
  throw new Error('Supervisor started without a session file')
}
const session: Session = initial,
  logLines: string[] = [],
  supervisorLog = join(session.runDir, 'supervisor.log')

let homebridge: ChildProcess | undefined,
  sinkClose: (() => Promise<void>) | undefined,
  stopping = false,
  ready = false

function log(message: string) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  appendFileSync(supervisorLog, line)
}

function topology(): HapTopology {
  return {
    bridgePort: session.bridgePort,
    externalPorts: [],
    pin: session.pin,
  }
}

async function fullTopology(): Promise<HapTopology> {
  const ports = []
  for (
    let port = session.externalPorts.start;
    port <= session.externalPorts.end;
    port++
  ) {
    ports.push(port)
  }
  return {
    ...topology(),
    externalPorts: await discoverExternalPorts(ports),
  }
}

async function startSink() {
  if (session.mode === 'fake') {
    const scenario = await loadScenario(session.scenario ?? 'default'),
      fake = await startFakeRing({
        port: session.sinkPort,
        scenario,
        scenarioName: session.scenario ?? 'default',
        logFile: join(session.runDir, 'fake-ring.jsonl'),
      })
    sinkClose = fake.close
    log(`fake Ring cloud listening on 127.0.0.1:${session.sinkPort}`)
    return
  }

  // Live mode: requests blocked by the preload guard are redirected here and
  // answered with a 403 so ring-client-api fails once instead of retrying.
  const server: Server = createServer((req, res) => {
    const blocked = req.url?.startsWith('/_blocked/')
    res.writeHead(blocked ? 403 : 404, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        error: blocked
          ? 'Blocked by the verify-ring live safety guard'
          : 'Not found',
      }),
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(session.sinkPort, '127.0.0.1', () => resolve())
  })
  sinkClose = () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  log(`live block sink listening on 127.0.0.1:${session.sinkPort}`)
}

function platformConfig() {
  const base: Record<string, unknown> = {
    controlCenterDisplayName: `ring-verify ${session.runId}`,
    debug: session.debug,
  }

  if (session.mode === 'fake') {
    return {
      ...base,
      refreshToken: fakeRefreshToken,
      cameraStatusPollingSeconds: 5,
      locationModePollingSeconds: 5,
      ...session.platformOverrides,
    }
  }

  const refreshToken = readFileSync(liveTokenFile, 'utf8').trim()
  return { ...base, ...session.platformOverrides, refreshToken }
}

function prepareStorage() {
  mkdirSync(session.storageDir, { recursive: true })
  writeHomebridgeConfig(session, platformConfig())

  // Reuse one systemId for the live account so Ring's Control Center shows
  // a single "ring-verify" client instead of a new one per launch.
  const storageSystemId = join(session.storageDir, '.ring.json')
  if (session.mode === 'live' && existsSync(liveSystemIdFile)) {
    copyFileSync(liveSystemIdFile, storageSystemId)
  }
}

function syncLiveFiles() {
  if (session.mode !== 'live') {
    return
  }
  const storageSystemId = join(session.storageDir, '.ring.json')
  if (existsSync(storageSystemId) && !existsSync(liveSystemIdFile)) {
    mkdirSync(liveDir, { recursive: true })
    copyFileSync(storageSystemId, liveSystemIdFile)
  }

  // The plugin rewrites config.json when Ring rotates the refresh token.
  // Keep the shared token file current so the next launch still works.
  const rotated = readPlatformConfig(session.storageDir)?.refreshToken
  if (typeof rotated === 'string' && rotated) {
    const current = existsSync(liveTokenFile)
      ? readFileSync(liveTokenFile, 'utf8').trim()
      : ''
    if (rotated !== current) {
      writeFileSync(liveTokenFile, rotated + '\n', { mode: 0o600 })
      log('refresh token rotated by Ring; saved the new token')
    }
  }
}

function fail(error: string, next: string[] = []) {
  if (stopping) {
    return
  }
  log(`FAILED: ${error}`)
  updateSession({
    status: 'failed',
    error,
    errorNext: next,
    logTail: logLines.slice(-40),
  })
  void shutdown('failed', { keepStatus: true })
}

function startHomebridge() {
  const preload = pathToFileURL(join(skillDir, 'runtime/preload.ts')).href,
    cli = realpathSync(homebridgeBin),
    env: NodeJS.ProcessEnv = {
      ...process.env,
      RING_VERIFY_MODE: session.mode,
      RING_VERIFY_SINK_URL: `http://127.0.0.1:${session.sinkPort}`,
      RING_VERIFY_GUARD_FILE: join(session.runDir, 'guard.jsonl'),
      RING_VERIFY_LISTENERS_FILE: join(session.runDir, 'listeners.jsonl'),
      FORCE_COLOR: '0',
    }
  // RING_DEBUG renames every accessory and changes its UUID. Never inherit it.
  delete env.RING_DEBUG

  const args = [
    '--conditions=development',
    '--import',
    preload,
    cli,
    '-I',
    '-Q',
    '-U',
    session.storageDir,
    '-P',
    pluginShimDir,
    '--strict-plugin-resolution',
    ...(session.debug ? ['-D'] : []),
  ]

  const output = createWriteStream(join(session.runDir, 'homebridge.log'), {
      flags: 'a',
    }),
    child = spawn(process.execPath, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  homebridge = child
  updateSession({ homebridgePid: child.pid })
  log(`homebridge started (pid ${child.pid})`)

  let partial = ''
  const onData = (chunk: Buffer) => {
    output.write(chunk)
    partial += chunk.toString('utf8')
    const lines = partial.split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) {
      logLines.push(line)
      if (logLines.length > 2000) {
        logLines.shift()
      }
      if (!ready) {
        for (const pattern of fatalPatterns) {
          const match = pattern.exec(line)
          if (match) {
            fail(match[0], nextStepsForFailure(match[0]))
          }
        }
      }
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)

  child.on('exit', (code, signal) => {
    output.end()
    log(`homebridge exited (code ${code}, signal ${signal})`)
    if (!stopping) {
      fail(`Homebridge exited unexpectedly (code ${code}, signal ${signal})`, [
        'Read the end of `ring-ctl logs` for the crash.',
        session.mode === 'live'
          ? 'Any live writes not yet restored are restored automatically on the next `ring-ctl launch live`.'
          : 'Relaunch with `ring-ctl launch fake` after fixing the cause.',
      ])
    }
  })
}

function nextStepsForFailure(error: string) {
  if (/oauth|Refresh token|2-factor/i.test(error)) {
    return [
      'The live refresh token was rejected. Ask the user to create a new one with `npm run auth-cli` and import it with `ring-ctl token import`.',
    ]
  }
  if (/EADDRINUSE/.test(error)) {
    return ['Run `ring-ctl cleanup` and launch again to pick fresh ports.']
  }
  return ['Read `ring-ctl logs` for the full Homebridge output.']
}

function parseLocations() {
  const found: { id: string; name: string }[] = [],
    configured = new Set<string>()
  for (const line of logLines) {
    const location = /\blocationId: (\S+) - (.+)$/.exec(line)
    if (location && !/Configuring/.test(line)) {
      found.push({ id: location[1], name: location[2].trim() })
    }
    const config =
      /Configuring \d+ cameras and \d+ devices for location ".*" - locationId: (\S+)/.exec(
        line,
      )
    if (config) {
      configured.add(config[1])
    }
  }
  return { found, configured }
}

async function waitUntilReady() {
  const deadline = Date.now() + session.timeoutSeconds * 1000
  let lastSignature = '',
    stableSince = 0

  while (Date.now() < deadline) {
    if (stopping) {
      return false
    }
    await delay(1000)

    const { found, configured } = parseLocations(),
      sawLocations = logLines.some((l) =>
        l.includes('Found the following locations:'),
      )
    if (!sawLocations) {
      continue
    }
    if (found.length === 0) {
      fail('Ring returned no locations for this account', [
        session.mode === 'fake'
          ? 'The fake scenario has no locations. Check the scenario file.'
          : 'Check the token belongs to the right Ring account, or remove --location filters.',
      ])
      return false
    }
    if (!found.every((l) => configured.has(l.id))) {
      continue
    }

    let signature: string, count: number
    try {
      const accessories = await loadAccessories(await fullTopology())
      count = accessories.length
      signature = accessories
        .map((a) => `${a.port}:${a.aid}:${a.name}`)
        .sort()
        .join('|')
    } catch {
      continue
    }

    if (signature !== lastSignature) {
      lastSignature = signature
      stableSince = Date.now()
      continue
    }
    if (Date.now() - stableSince >= 3000) {
      updateSession({ locations: found, accessoryCount: count })
      return true
    }
  }

  fail(`Homebridge was not ready within ${session.timeoutSeconds}s`, [
    'Read `ring-ctl logs` to see where startup stopped.',
    'Large accounts can take longer; relaunch with a larger --timeout.',
  ])
  return false
}

// Startup restores compare drift against the previous run's baseline.
async function runRestore(
  label: string,
  baselineRunId?: string,
): Promise<RestoreReport | undefined> {
  if (session.mode !== 'live') {
    return undefined
  }
  try {
    const report = await restoreLive({
      topology: await fullTopology(),
      runDir: session.runDir,
      runId: baselineRunId,
    })
    log(
      `${label} restore: ${report.ok ? 'ok' : 'INCOMPLETE'} (${
        report.items.length
      } items, ${report.drift.length} drift)`,
    )
    return report
  } catch (e) {
    log(`${label} restore threw: ${e instanceof Error ? e.stack : e}`)
    return {
      at: new Date().toISOString(),
      ok: false,
      items: [],
      drift: [],
    }
  }
}

async function stopHomebridge() {
  const child = homebridge
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGTERM')
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && isAlive(child.pid)) {
    await delay(200)
  }
  if (isAlive(child.pid)) {
    child.kill('SIGKILL')
  }
}

async function shutdown(
  reason: string,
  { keepStatus = false }: { keepStatus?: boolean } = {},
) {
  if (stopping) {
    return
  }
  stopping = true
  log(`shutting down: ${reason}`)
  if (!keepStatus) {
    updateSession({ status: 'stopping', stopReason: reason })
  }

  const homebridgeRunning =
    homebridge && homebridge.exitCode === null && homebridge.signalCode === null
  if (session.mode === 'live' && homebridgeRunning && pendingWrites().length) {
    const report = await runRestore('shutdown', session.runId)
    updateSession({ shutdownRestore: report })
  }

  await stopHomebridge()
  await sinkClose?.().catch(() => undefined)
  syncLiveFiles()
  if (session.mode === 'live') {
    clearPermits()
    releaseLiveLock(session.runId)
  }

  updateSession({
    ...(keepStatus ? {} : { status: 'stopped' }),
    stopReason: reason,
    stoppedAt: new Date().toISOString(),
  })
  log('stopped')
  process.exit(0)
}

async function main() {
  updateSession({ supervisorPid: process.pid })
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => void shutdown(`signal ${signal}`))
  }
  process.on('uncaughtException', (e) => {
    log(`supervisor crashed: ${e.stack}`)
    fail(`Supervisor crashed: ${e.message}`)
  })

  await startSink()
  prepareStorage()
  startHomebridge()

  if (!(await waitUntilReady())) {
    return
  }

  if (session.mode === 'live') {
    // A previous live session died before restoring. Fix the account first.
    if (pendingWrites().length) {
      log('found unrestored writes from an earlier live session')
      updateSession({ startupRestore: await runRestore('startup') })
    }
    await captureBaseline(await fullTopology(), session.runId, session.runDir)
    log('captured live baseline')
    syncLiveFiles()
  }

  ready = true
  updateSession({
    status: 'ready',
    readyAt: new Date().toISOString(),
    logTail: undefined,
  })
  log('ready')

  const idleMs = session.idleMinutes * 60_000
  setInterval(() => {
    if (stopping) {
      return
    }
    syncLiveFiles()
    if (heartbeatAgeMs() > idleMs) {
      void shutdown(`idle for ${session.idleMinutes} minutes`)
    }
  }, 15_000)
}

main().catch((e) => {
  log(`supervisor failed: ${e instanceof Error ? e.stack : e}`)
  fail(e instanceof Error ? e.message : String(e))
})
