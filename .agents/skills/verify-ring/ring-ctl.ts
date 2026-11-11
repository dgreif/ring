#!/usr/bin/env node
// ring-ctl: drive homebridge-ring through HomeKit (HAP) the way the Home app
// does, against the real Ring cloud (live) or a local fake (fake). Every
// command prints one JSON object. See SKILL.md.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import {
  allCharacteristics,
  coerceValue,
  discoverExternalPorts,
  type FlatAccessory,
  type FlatCharacteristic,
  type HapEvent,
  type HapTopology,
  labelValue,
  loadAccessories,
  readCharacteristic,
  readCharacteristics,
  requestSnapshot,
  resolveRef,
  sameValue,
  subscribe,
  writeCharacteristic,
} from './src/hap.ts'
import {
  keyFor,
  pendingWrites,
  recordResolution,
  recordWrite,
} from './src/journal.ts'
import { CliError, delay, printError, printJson } from './src/output.ts'
import {
  checkoutDir,
  checkoutHash,
  evidenceRoot,
  homebridgeBin,
  homebridgeRingDir,
  liveDir,
  liveTokenFile,
  repoRoot,
  skillDir,
  storageDirFor,
  verifyHome,
} from './src/paths.ts'
import { checkLiveWrite, grantPermits } from './src/policy.ts'
import { restoreLive } from './src/restore.ts'
import {
  acquireLiveLock,
  allocatePortBlock,
  bridgeUsernameFor,
  generatePin,
  heartbeatAgeMs,
  isAlive,
  isSessionActive,
  type Mode,
  newRunDir,
  preparePluginShim,
  readLiveLock,
  readSession,
  type Session,
  touchHeartbeat,
  updateSession,
  writeSession,
} from './src/session.ts'

const usage = `ring-ctl - verify homebridge-ring end to end through HomeKit

Usage: node .agents/skills/verify-ring/ring-ctl.ts <command> [options]

Session
  doctor                              Check prerequisites and current state
  launch <fake|live>                  Start Homebridge + the plugin from source
      --scenario <name|path>          Fake scenario (default: default)
      --platform-config <json>        Extra Ring platform config, e.g. '{"hideLightGroups":true}'
      --location <id>                 Live: only use this location (repeatable)
      --fresh                         Delete this checkout's Homebridge storage first
      --debug                         Plugin debug logging
      --restart                       Stop a running session first
      --idle-minutes <n>              Auto-stop (and restore) after n idle minutes (default 15)
      --timeout <seconds>             Startup timeout (default 90)
  status                              Session, ports, guard and journal state
  stop                                Restore live changes, then stop everything
  cleanup [--storage] [--evidence] [--dry-run]
                                      Stop and delete per-checkout state
  logs [--source s] [--lines n] [--grep re]
                                      s: homebridge|supervisor|guard|listeners|fake

HomeKit
  accessories [--filter text] [--all] [--full]
                                      List accessories and characteristic refs
  get <ref>...                        Read current values
  set <ref> <value> [--allow-arm] [--allow-unlock] [--dry-run]
                                      Write a value like the Home app would
  wait <ref> <value> [--timeout s]    Poll until a characteristic has a value
  watch [ref...] [--filter text] [--duration|--timeout s] [--until ref=value]
                                      Collect HAP change events
  snapshot <camera> [--out file] [--width n] [--height n] [--timeout s]

Fake cloud (fake mode only)
  emit ding <camera|intercom> [--subtype s] [--no-expect] [--timeout s]
  emit motion <camera> [--subtype human|vehicle|other] [--no-expect] [--timeout s]
  emit hub-update <zid|name> <json>   Change an alarm/beams device as Ring would
  emit camera-update <id|name> <json> Change a camera's Ring data (next poll)
  emit hub-disconnect                 Drop the hub WebSocket
  emit ring-error <path-regex> [--status n] [--count n] [--method m]
                                      Fail the next matching Ring REST call(s)
  ring-state [--section s]            What the fake cloud saw and holds now
      s: events|requests|unhandled|faults|hub|cameras|intercoms|locations|hubMessages

Live safety (live mode only)
  restore [--allow-unlock] [--abandon] [--dry-run]
                                      Undo journaled writes now
  token import                        Read a refresh token from stdin
  token status

Refs look like "<Accessory>/<Service label>/<Characteristic>" or the shorter
"<Accessory>/<Characteristic>" when unique. Enum values accept their names,
e.g. \`set "Alarm/SecuritySystemTargetState" DISARM\`.`

const hapStatusNames: Record<number, string> = {
  [-70401]: 'INSUFFICIENT_PRIVILEGES',
  [-70402]: 'SERVICE_COMMUNICATION_FAILURE (the plugin threw or Ring failed)',
  [-70403]: 'RESOURCE_BUSY',
  [-70404]: 'READ_ONLY_CHARACTERISTIC',
  [-70405]: 'WRITE_ONLY_CHARACTERISTIC',
  [-70406]: 'NOTIFICATION_NOT_SUPPORTED',
  [-70407]: 'OUT_OF_RESOURCE',
  [-70408]: 'OPERATION_TIMED_OUT',
  [-70409]: 'RESOURCE_DOES_NOT_EXIST',
  [-70410]: 'INVALID_VALUE_IN_REQUEST',
  [-70411]: 'INSUFFICIENT_AUTHORIZATION',
  [-70412]: 'NOT_ALLOWED_IN_CURRENT_STATE',
}

type Options = NonNullable<ParseArgsConfig['options']>

function parse<const T extends Options>(argv: string[], options: T) {
  // parseArgs reads "-2" as a short option. Values like temperatures can be
  // negative, so treat bare negative numbers as positionals.
  const negatives = new Map<string, string>(),
    args = argv.map((arg, i) => {
      const previous = argv[i - 1]
      if (
        /^-\d+(\.\d+)?$/.test(arg) &&
        !(
          previous?.startsWith('--') &&
          options[previous.slice(2)]?.type === 'string'
        )
      ) {
        const placeholder = `\0negative${i}`
        negatives.set(placeholder, arg)
        return placeholder
      }
      return arg
    })
  try {
    const result = parseArgs({
      args,
      options,
      allowPositionals: true as const,
    })
    result.positionals = result.positionals.map(
      (value) => negatives.get(value) ?? value,
    )
    return result
  } catch (e) {
    throw new CliError(e instanceof Error ? e.message : String(e), {
      code: 'bad-arguments',
      next: ['Run `ring-ctl help` for usage.'],
    })
  }
}

function numberOption(value: unknown, fallback: number, name: string) {
  if (value === undefined) {
    return fallback
  }
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new CliError(`--${name} must be a positive number`, {
      code: 'bad-arguments',
    })
  }
  return number
}

function parseJsonArg(value: string, name: string) {
  try {
    return JSON.parse(value)
  } catch {
    throw new CliError(`${name} is not valid JSON: ${value}`, {
      code: 'bad-arguments',
      next: [`Quote it for the shell, e.g. '{"faulted":true}'.`],
    })
  }
}

function access(char: FlatCharacteristic) {
  return (
    (char.perms.includes('pr') ? 'r' : '') +
    (char.perms.includes('pw') ? 'w' : '') +
    (char.perms.includes('ev') ? 'e' : '')
  )
}

function describeValue(char: FlatCharacteristic, value: unknown) {
  const label = labelValue(char.name.replace(/#\d+$/, ''), value)
  return label === undefined ? { value } : { value, valueLabel: label }
}

// --- Session helpers --------------------------------------------------------

function requireSession({ mode }: { mode?: Mode } = {}) {
  const session = readSession()
  if (!session || !isSessionActive(session)) {
    throw new CliError('No verification session is running', {
      code: 'no-session',
      details: session
        ? { lastStatus: session.status, lastError: session.error }
        : undefined,
      next: [
        'Start one with `ring-ctl launch fake` or `ring-ctl launch live`.',
      ],
    })
  }
  if (session.status !== 'ready') {
    throw new CliError(`Session is ${session.status}, not ready`, {
      code: 'not-ready',
      next: [
        'Run `ring-ctl status` until it is ready, or `ring-ctl logs` to see why not.',
      ],
    })
  }
  if (mode && session.mode !== mode) {
    throw new CliError(
      `This command only works in ${mode} mode; the session is ${session.mode}`,
      {
        code: 'wrong-mode',
        next: [`Relaunch with \`ring-ctl launch ${mode} --restart\`.`],
      },
    )
  }
  return session
}

async function topologyFor(session: Session): Promise<HapTopology> {
  const ports = []
  for (
    let port = session.externalPorts.start;
    port <= session.externalPorts.end;
    port++
  ) {
    ports.push(port)
  }
  return {
    bridgePort: session.bridgePort,
    externalPorts: await discoverExternalPorts(ports),
    pin: session.pin,
  }
}

async function accessoriesFor(session: Session) {
  return loadAccessories(await topologyFor(session))
}

function readJsonLines(file: string) {
  if (!existsSync(file)) {
    return []
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
}

function guardSummary(session: Session) {
  const entries = readJsonLines(join(session.runDir, 'guard.jsonl')),
    blocked = entries.filter((e) => e.action === 'block')
  return {
    blockedCount: blocked.length,
    recentBlocks: blocked.slice(-5),
    allowedWrites: entries.filter((e) => e.action === 'allow').length,
  }
}

async function fakeControl(
  session: Session,
  path: string,
  body?: unknown,
): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${session.sinkPort}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    result = await response.json()
  if (!response.ok) {
    throw new CliError(
      result.error ?? `Fake cloud returned ${response.status}`,
      {
        code: 'fake-cloud-error',
        details: result,
      },
    )
  }
  return result
}

// --- Commands ---------------------------------------------------------------

async function doctor() {
  const checks: {
      name: string
      ok: boolean
      detail?: unknown
      next?: string
    }[] = [],
    [major, minor] = process.versions.node.split('.').map(Number)

  checks.push({
    name: 'node',
    ok: major > 22 || (major === 22 && minor >= 18),
    detail: process.version,
    next: 'Use Node 22.18+ so TypeScript sources run without a build.',
  })
  checks.push({
    name: 'homebridge',
    ok: existsSync(homebridgeBin),
    detail: homebridgeBin,
    next: 'Run `npm ci` at the repo root.',
  })
  checks.push({
    name: 'plugin-sources',
    ok: existsSync(join(homebridgeRingDir, 'index.ts')),
    detail: homebridgeRingDir,
  })

  const token = existsSync(liveTokenFile)
  checks.push({
    name: 'live-token',
    ok: token,
    detail: token
      ? { file: liveTokenFile, updatedAt: statSync(liveTokenFile).mtime }
      : 'missing (only needed for live mode)',
    next: token
      ? undefined
      : 'Ask the user to run `node --conditions=development packages/ring-client-api/ring-auth-cli.ts` in their own terminal and pipe the token into `ring-ctl token import`.',
  })

  const lock = readLiveLock()
  checks.push({
    name: 'live-lock',
    ok: !lock || !isAlive(lock.pid) || lock.checkoutHash === checkoutHash,
    detail: lock && isAlive(lock.pid) ? lock : 'free',
    next: 'Another checkout is driving the live account. Use fake mode or wait.',
  })

  const session = readSession()
  checks.push({
    name: 'session',
    ok: true,
    detail: session
      ? {
          mode: session.mode,
          status: isSessionActive(session) ? session.status : 'not running',
          runDir: session.runDir,
        }
      : 'none',
  })

  const pending = pendingWrites(),
    liveRunning = session?.mode === 'live' && isSessionActive(session)
  checks.push({
    name: 'live-journal',
    ok: pending.length === 0 || liveRunning,
    detail: { pendingWrites: pending.length },
    next: !pending.length
      ? undefined
      : liveRunning
      ? 'The running live session made these writes. `ring-ctl stop` restores them.'
      : 'Unrestored live writes exist. `ring-ctl launch live` restores them on startup.',
  })

  mkdirSync(evidenceRoot, { recursive: true })
  checks.push({ name: 'evidence-dir', ok: true, detail: evidenceRoot })

  return {
    ok: checks.every((c) => c.ok || c.name === 'live-token'),
    checkout: repoRoot,
    checkoutHash,
    verifyHome,
    checks: checks.map((c) => (c.ok ? { ...c, next: undefined } : c)),
  }
}

async function readySummary(session: Session) {
  const accessories = await accessoriesFor(session)
  return {
    ok: true,
    status: session.status,
    mode: session.mode,
    runId: session.runId,
    scenario: session.mode === 'fake' ? session.scenario : undefined,
    runDir: session.runDir,
    bridgePort: session.bridgePort,
    locations: session.locations,
    accessoryCount: accessories.length,
    accessories: accessories.map((a) => ({
      name: a.name,
      model: a.model,
      external: a.external || undefined,
    })),
    startupRestore: session.startupRestore,
    next: [
      'List refs: `ring-ctl accessories --filter <name>`',
      'Change something: `ring-ctl set <ref> <value>`, then `ring-ctl get <ref>`',
      session.mode === 'fake'
        ? 'Trigger Ring events: `ring-ctl emit ding <camera>`'
        : 'Live writes are journaled and restored by `ring-ctl stop`.',
    ],
  }
}

async function waitForLaunch(supervisorPid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const session = readSession()
    if (session?.status === 'ready') {
      return readySummary(session)
    }
    if (session?.status === 'failed') {
      throw new CliError(`Launch failed: ${session.error}`, {
        code: 'launch-failed',
        details: { runDir: session.runDir, logTail: session.logTail },
        next: [
          ...(session.errorNext ?? []),
          'Full output: `ring-ctl logs --source homebridge --lines 200`',
        ],
      })
    }
    if (!isAlive(supervisorPid)) {
      const log = session ? join(session.runDir, 'supervisor.log') : undefined
      throw new CliError('The supervisor process exited during startup', {
        code: 'supervisor-died',
        details: {
          supervisorLog:
            log && existsSync(log)
              ? readFileSync(log, 'utf8').split('\n').slice(-40)
              : undefined,
        },
        next: [
          'This is likely a bug in the skill. See "Maintaining this skill" in SKILL.md.',
        ],
      })
    }
    await delay(500)
  }
  throw new CliError('Timed out waiting for the session to become ready', {
    code: 'launch-timeout',
    next: ['Check `ring-ctl status` and `ring-ctl logs`.'],
  })
}

async function launch(argv: string[]) {
  const { values, positionals } = parse(argv, {
      scenario: { type: 'string' },
      'platform-config': { type: 'string' },
      location: { type: 'string', multiple: true },
      fresh: { type: 'boolean' },
      debug: { type: 'boolean' },
      restart: { type: 'boolean' },
      'idle-minutes': { type: 'string' },
      timeout: { type: 'string' },
    }),
    mode = positionals[0] as Mode

  if (mode !== 'fake' && mode !== 'live') {
    throw new CliError(
      'Choose a mode: `ring-ctl launch fake` or `ring-ctl launch live`',
      {
        code: 'bad-arguments',
        next: [
          'live drives the real Ring account (journaled, restored on stop, dangerous actions blocked).',
          'fake uses a local fake Ring cloud with scenarios for devices the account does not have.',
        ],
      },
    )
  }

  const existing = readSession()
  if (isSessionActive(existing)) {
    if (values.restart) {
      await stopSession()
    } else if (existing!.mode !== mode) {
      throw new CliError(`A ${existing!.mode} session is already running`, {
        code: 'session-running',
        next: [`Run \`ring-ctl stop\` first, or pass --restart.`],
      })
    } else {
      touchHeartbeat()
      return {
        ...(await waitForLaunch(existing!.supervisorPid!, 120_000)),
        alreadyRunning: true,
      }
    }
  }

  if (mode === 'live' && !existsSync(liveTokenFile)) {
    throw new CliError('No live refresh token has been imported', {
      code: 'no-live-token',
      next: [
        'Ask the user to create a dedicated token by running `node --conditions=development packages/ring-client-api/ring-auth-cli.ts` themselves (it asks for their Ring password and 2FA code; never handle those yourself).',
        'Then import it: `pbpaste | node .agents/skills/verify-ring/ring-ctl.ts token import`',
      ],
    })
  }

  const platformOverrides = values['platform-config']
    ? parseJsonArg(values['platform-config'], '--platform-config')
    : {}
  if (values.location?.length) {
    platformOverrides.locationIds = values.location
  }
  if (mode === 'live' && 'refreshToken' in platformOverrides) {
    throw new CliError(
      'Do not pass refreshToken; live mode uses the imported token',
      {
        code: 'bad-arguments',
      },
    )
  }

  const runId = randomBytes(3).toString('hex')
  if (mode === 'live') {
    acquireLiveLock(runId, process.pid)
  }

  const portBase = await allocatePortBlock(),
    storageDir = storageDirFor(mode)
  if (values.fresh) {
    rmSync(storageDir, { recursive: true, force: true })
  }
  preparePluginShim()

  const runDir = newRunDir(mode, runId),
    timeoutSeconds = numberOption(values.timeout, 90, 'timeout'),
    session: Session = {
      mode,
      runId,
      runDir,
      storageDir,
      portBase,
      bridgePort: portBase,
      sinkPort: portBase + 1,
      externalPorts: { start: portBase + 2, end: portBase + 31 },
      pin: generatePin(),
      username: bridgeUsernameFor(mode),
      scenario: mode === 'fake' ? values.scenario ?? 'default' : undefined,
      debug: Boolean(values.debug),
      idleMinutes: numberOption(values['idle-minutes'], 15, 'idle-minutes'),
      timeoutSeconds,
      platformOverrides,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }
  writeSession(session)
  touchHeartbeat()

  const out = openSync(join(runDir, 'supervisor.log'), 'a'),
    child = spawn(
      process.execPath,
      ['--conditions=development', join(skillDir, 'src/supervisor.ts')],
      { detached: true, stdio: ['ignore', out, out], cwd: repoRoot },
    )
  child.unref()
  if (mode === 'live') {
    acquireLiveLock(runId, child.pid!)
  }

  return waitForLaunch(child.pid!, (timeoutSeconds + 60) * 1000)
}

async function stopSession() {
  const session = readSession()
  if (!session || !isSessionActive(session)) {
    return { ok: true, wasRunning: false }
  }

  process.kill(session.supervisorPid!, 'SIGTERM')
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline && isAlive(session.supervisorPid)) {
    await delay(300)
  }

  let forced = false
  if (isAlive(session.supervisorPid)) {
    forced = true
    process.kill(session.supervisorPid!, 'SIGKILL')
  }
  const final = readSession() ?? session
  if (isAlive(final.homebridgePid)) {
    forced = true
    process.kill(final.homebridgePid!, 'SIGKILL')
  }
  if (forced) {
    updateSession({ status: 'stopped', stopReason: 'forced by ring-ctl stop' })
  }

  const pending = session.mode === 'live' ? pendingWrites().length : 0
  return {
    ok: pending === 0,
    wasRunning: true,
    mode: session.mode,
    forced: forced || undefined,
    runDir: session.runDir,
    restore: final.shutdownRestore,
    pendingLiveWrites: session.mode === 'live' ? pending : undefined,
    next: pending
      ? [
          'Some live writes were not restored. `ring-ctl launch live` retries them on startup; tell the user what is still changed.',
        ]
      : undefined,
  }
}

async function status() {
  const session = readSession()
  if (!session) {
    return { ok: true, running: false, next: ['`ring-ctl launch fake|live`'] }
  }
  const active = isSessionActive(session)
  return {
    ok: true,
    running: active,
    mode: session.mode,
    status: active
      ? session.status
      : session.status === 'failed'
      ? 'failed'
      : 'stopped',
    runId: session.runId,
    runDir: session.runDir,
    scenario: session.scenario,
    bridgePort: session.bridgePort,
    sinkPort: session.sinkPort,
    startedAt: session.startedAt,
    readyAt: session.readyAt,
    stoppedAt: session.stoppedAt,
    stopReason: session.stopReason,
    error: session.error,
    idleMinutes: session.idleMinutes,
    heartbeatAgeSeconds: Math.round(heartbeatAgeMs() / 1000),
    locations: session.locations,
    accessoryCount: session.accessoryCount,
    guard: guardSummary(session),
    pendingLiveWrites: pendingWrites().length,
    liveLock: readLiveLock(),
  }
}

function charSummary(char: FlatCharacteristic, full: boolean) {
  if (full) {
    return char
  }
  return {
    ref: char.ref,
    ...describeValue(char, char.value),
    access: access(char),
    format: char.format,
    ...(char.validValueLabels
      ? { options: Object.keys(char.validValueLabels) }
      : {}),
    ...(char.minValue !== undefined || char.maxValue !== undefined
      ? { range: [char.minValue, char.maxValue] }
      : {}),
  }
}

async function accessories(argv: string[]) {
  const { values } = parse(argv, {
      filter: { type: 'string' },
      all: { type: 'boolean' },
      full: { type: 'boolean' },
    }),
    session = requireSession(),
    list = await accessoriesFor(session),
    filter = values.filter?.toLowerCase()

  const result = list
    .map((accessory) => {
      const accessoryMatches =
        !filter || accessory.name.toLowerCase().includes(filter)
      const services = accessory.services
        .filter((s) => values.all || !s.hidden)
        .map((service) => ({
          label: service.label,
          type: service.type,
          characteristics: service.characteristics
            .filter(
              (c) => accessoryMatches || c.ref.toLowerCase().includes(filter!),
            )
            .map((c) => charSummary(c, Boolean(values.full))),
        }))
        .filter((s) => s.characteristics.length)
      return {
        name: accessory.name,
        model: accessory.model,
        serial: values.full ? accessory.serial : undefined,
        port: accessory.port,
        external: accessory.external || undefined,
        services,
      }
    })
    .filter((a) => a.services.length)

  return {
    ok: true,
    mode: session.mode,
    count: result.length,
    accessories: result,
    note: 'access: r=read w=write e=events. Hidden services (camera streaming, info) need --all.',
  }
}

async function get(argv: string[]) {
  const { positionals } = parse(argv, {}),
    session = requireSession()
  if (!positionals.length) {
    throw new CliError('Pass at least one ref', { code: 'bad-arguments' })
  }
  const list = await accessoriesFor(session),
    targets = positionals.map((ref) => resolveRef(list, ref)),
    values = await readCharacteristics(session.pin, targets)
  return {
    ok: true,
    values: targets.map((t) => ({
      ref: t.ref,
      ...describeValue(t, values.get(t)),
    })),
  }
}

async function set(argv: string[]) {
  const { values, positionals } = parse(argv, {
      'allow-arm': { type: 'boolean' },
      'allow-unlock': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    }),
    session = requireSession(),
    [ref, rawValue] = positionals
  if (ref === undefined || rawValue === undefined) {
    throw new CliError('Usage: ring-ctl set <ref> <value>', {
      code: 'bad-arguments',
    })
  }

  const list = await accessoriesFor(session),
    target = resolveRef(list, ref)
  if (!target.perms.includes('pw')) {
    throw new CliError(`${target.ref} is not writable`, {
      code: 'not-writable',
      details: { access: access(target) },
      next: [
        'Use `ring-ctl get` to read it, or pick a writable ref (access contains "w").',
      ],
    })
  }

  const value = coerceValue(target, rawValue),
    result: Record<string, unknown> = { ok: true, ref: target.ref },
    decision =
      session.mode === 'live'
        ? checkLiveWrite(target, value, {
            allowArm: values['allow-arm'],
            allowUnlock: values['allow-unlock'],
          })
        : undefined

  if (values['dry-run']) {
    const current = target.perms.includes('pr')
      ? await readCharacteristic(session.pin, target)
      : undefined
    return {
      ...result,
      dryRun: true,
      mode: session.mode,
      current:
        current === undefined ? undefined : describeValue(target, current),
      wouldWrite: describeValue(target, value),
      allowed: decision ? decision.allowed : true,
      reason: decision && !decision.allowed ? decision.reason : undefined,
      requires: decision?.requires,
      journaled: session.mode === 'live' && (decision?.allowed ?? false),
    }
  }

  if (decision) {
    if (!decision.allowed) {
      throw new CliError(`Blocked in live mode: ${decision.reason}`, {
        code: 'blocked-by-policy',
        next: decision.requires
          ? [
              `Only if the user explicitly asked for this, repeat with --allow-${decision.requires}. It will be restored on stop.`,
              'Otherwise verify this behavior in fake mode: `ring-ctl launch fake --restart`.',
            ]
          : [
              'Verify this behavior in fake mode instead: `ring-ctl launch fake --restart`.',
            ],
      })
    }

    const readable = target.perms.includes('pr'),
      before = readable ? await readCharacteristic(session.pin, target) : null,
      entry = recordWrite({
        runId: session.runId,
        ref: target.ref,
        key: keyFor(target),
        before,
        beforeReadable:
          readable &&
          !(before && typeof before === 'object' && 'hapStatus' in before),
        after: value,
      })
    grantPermits(decision.permits)
    Object.assign(result, {
      before: describeValue(target, before),
      journalSeq: entry.seq,
      permits: decision.permits.length ? decision.permits : undefined,
    })
  }

  const write = await writeCharacteristic(session.pin, target, value)
  if (!write.ok) {
    throw new CliError(`HomeKit write to ${target.ref} failed`, {
      code: 'write-failed',
      details: {
        httpStatus: write.httpStatus,
        hapStatus: write.hapStatus,
        meaning: hapStatusNames[write.hapStatus],
      },
      next: [
        'Check `ring-ctl logs --grep error` for the plugin error.',
        ...(session.mode === 'live'
          ? [
              'The write was journaled anyway; `ring-ctl stop` will put back the old value if it changed.',
            ]
          : []),
      ],
    })
  }

  await delay(500)
  const readBack = target.perms.includes('pr')
    ? await readCharacteristic(session.pin, target)
    : undefined

  return {
    ...result,
    written: describeValue(target, value),
    readBack:
      readBack === undefined ? undefined : describeValue(target, readBack),
    next:
      target.name === 'SecuritySystemTargetState'
        ? [
            `The panel confirms asynchronously: \`ring-ctl wait "${target.accessoryName}/SecuritySystemCurrentState" <STATE>\``,
          ]
        : target.name === 'LockTargetState'
        ? [
            `The lock confirms asynchronously: \`ring-ctl wait "${target.accessoryName}/LockCurrentState" <STATE>\``,
          ]
        : undefined,
  }
}

async function wait(argv: string[]) {
  const { values, positionals } = parse(argv, {
      timeout: { type: 'string' },
    }),
    session = requireSession(),
    [ref, rawValue] = positionals
  if (ref === undefined || rawValue === undefined) {
    throw new CliError('Usage: ring-ctl wait <ref> <value>', {
      code: 'bad-arguments',
    })
  }
  const list = await accessoriesFor(session),
    target = resolveRef(list, ref),
    expected = coerceValue(target, rawValue),
    timeoutMs = numberOption(values.timeout, 30, 'timeout') * 1000,
    start = Date.now()
  let current: unknown
  do {
    current = await readCharacteristic(session.pin, target)
    if (sameValue(target, current, expected)) {
      return {
        ok: true,
        ref: target.ref,
        ...describeValue(target, current),
        elapsedMs: Date.now() - start,
      }
    }
    await delay(500)
    touchHeartbeat()
  } while (Date.now() - start < timeoutMs)

  throw new CliError(
    `${target.ref} did not become ${rawValue} within ${timeoutMs / 1000}s`,
    {
      code: 'wait-timeout',
      details: {
        expected: describeValue(target, expected),
        last: describeValue(target, current),
      },
      next: [
        'Check `ring-ctl logs --grep error` for plugin errors.',
        'Momentary values (doorbell presses) cannot be polled; use `ring-ctl watch`.',
      ],
    },
  )
}

function matchUntil(until: string | undefined, list: FlatAccessory[]) {
  if (!until) {
    return undefined
  }
  const index = until.lastIndexOf('=')
  if (index <= 0) {
    throw new CliError('--until must look like <ref>=<value>', {
      code: 'bad-arguments',
    })
  }
  const target = resolveRef(list, until.slice(0, index))
  return { target, value: coerceValue(target, until.slice(index + 1)) }
}

async function collectEvents(
  session: Session,
  targets: FlatCharacteristic[],
  durationMs: number,
  until?: { target: FlatCharacteristic; value: unknown },
  beforeWait?: () => Promise<unknown>,
) {
  const events: (HapEvent & { ref: string; valueLabel?: string })[] = [],
    byPort = new Map<number, FlatCharacteristic[]>()
  for (const target of targets) {
    byPort.set(target.port, [...(byPort.get(target.port) ?? []), target])
  }

  let matched = false,
    resolveMatched: () => void = () => undefined
  const matchedPromise = new Promise<void>((resolve) => {
    resolveMatched = resolve
  })

  const subscriptions = await Promise.all(
    [...byPort].map(([port, group]) =>
      subscribe(
        session.pin,
        port,
        group.map((t) => ({ aid: t.aid, iid: t.iid })),
        (event) => {
          const target = group.find(
            (t) => t.aid === event.aid && t.iid === event.iid,
          )
          if (!target) {
            return
          }
          events.push({
            ...event,
            ref: target.ref,
            ...describeValue(target, event.value),
          })
          if (
            until &&
            until.target === target &&
            sameValue(target, event.value, until.value)
          ) {
            matched = true
            resolveMatched()
          }
        },
      ),
    ),
  )

  let actionResult: unknown
  try {
    actionResult = await beforeWait?.()
    await Promise.race([delay(durationMs), matchedPromise])
  } finally {
    for (const subscription of subscriptions) {
      subscription.close()
    }
  }
  return { events, matched, actionResult }
}

async function watch(argv: string[]) {
  const { values, positionals } = parse(argv, {
      filter: { type: 'string' },
      duration: { type: 'string' },
      timeout: { type: 'string' },
      until: { type: 'string' },
    }),
    session = requireSession(),
    list = await accessoriesFor(session),
    filter = values.filter?.toLowerCase(),
    evented = allCharacteristics(list).filter((c) => c.perms.includes('ev')),
    targets = positionals.length
      ? positionals.map((ref) => resolveRef(list, ref))
      : evented.filter((c) => !filter || c.ref.toLowerCase().includes(filter)),
    until = matchUntil(values.until, list)

  if (until && !targets.includes(until.target)) {
    targets.push(until.target)
  }
  if (!targets.length) {
    throw new CliError('Nothing to watch', {
      code: 'nothing-to-watch',
      next: [
        'Pass refs, or a --filter that matches characteristics with events (access contains "e").',
      ],
    })
  }

  const durationMs =
      numberOption(values.duration ?? values.timeout, 10, 'duration') * 1000,
    { events, matched } = await collectEvents(
      session,
      targets,
      durationMs,
      until,
    )

  if (until && !matched) {
    throw new CliError(
      `${until.target.ref} did not reach ${values.until!.slice(
        values.until!.lastIndexOf('=') + 1,
      )} within ${durationMs / 1000}s`,
      { code: 'watch-timeout', details: { events } },
    )
  }
  return {
    ok: true,
    watched: targets.length,
    matched: until ? matched : undefined,
    events,
  }
}

function jpegSize(buffer: Buffer) {
  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      return undefined
    }
    const marker = buffer[offset + 1],
      length = buffer.readUInt16BE(offset + 2)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }
    offset += 2 + length
  }
  return undefined
}

function findCamera(list: FlatAccessory[], name: string) {
  const cameras = list.filter((a) =>
      a.services.some((s) => s.type === 'CameraRTPStreamManagement'),
    ),
    lowered = name.toLowerCase(),
    exact = cameras.filter((c) => c.name.toLowerCase() === lowered),
    partial = cameras.filter((c) => c.name.toLowerCase().includes(lowered)),
    matches = exact.length ? exact : partial
  if (matches.length !== 1) {
    throw new CliError(
      matches.length
        ? `"${name}" matches more than one camera`
        : `No camera named "${name}"`,
      {
        code: 'unknown-camera',
        details: { cameras: cameras.map((c) => c.name) },
      },
    )
  }
  return matches[0]
}

async function snapshot(argv: string[]) {
  const { values, positionals } = parse(argv, {
      out: { type: 'string' },
      width: { type: 'string' },
      height: { type: 'string' },
      timeout: { type: 'string' },
    }),
    session = requireSession()
  if (!positionals[0]) {
    throw new CliError('Usage: ring-ctl snapshot <camera>', {
      code: 'bad-arguments',
    })
  }
  const camera = findCamera(await accessoriesFor(session), positionals[0]),
    image = await requestSnapshot(session.pin, camera.port, {
      width: numberOption(values.width, 640, 'width'),
      height: numberOption(values.height, 360, 'height'),
      timeoutMs: numberOption(values.timeout, 30, 'timeout') * 1000,
    }),
    slug = camera.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    path = values.out
      ? resolve(values.out)
      : join(session.runDir, 'snapshots', `${slug}-${Date.now()}.jpg`)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, image)
  return {
    ok: true,
    camera: camera.name,
    path,
    bytes: image.length,
    ...jpegSize(image),
    source: session.mode === 'fake' ? 'fake cloud placeholder image' : 'Ring',
  }
}

async function emit(argv: string[]) {
  const { values, positionals } = parse(argv, {
      subtype: { type: 'string' },
      'no-expect': { type: 'boolean' },
      timeout: { type: 'string' },
      status: { type: 'string' },
      count: { type: 'string' },
      method: { type: 'string' },
    }),
    session = requireSession({ mode: 'fake' }),
    [kind, target, json] = positionals

  if (kind === 'ring-error') {
    if (!target) {
      throw new CliError(
        'Usage: ring-ctl emit ring-error <path-regex> [--status n] [--count n] [--method m]',
        { code: 'bad-arguments' },
      )
    }
    const result = await fakeControl(session, '/_control/ring-error', {
      path: target,
      status: values.status ? Number(values.status) : 500,
      count: values.count ? Number(values.count) : 1,
      method: values.method,
    })
    return {
      ok: true,
      armed: result.armed,
      next: [
        'Trigger the write or poll that hits this path, then check `ring-ctl logs` and `ring-ctl ring-state --section events` for ring-error-injected.',
        'Homebridge crashing here is a plugin bug: `ring-ctl status` will show the session as failed.',
      ],
    }
  }

  if (kind === 'hub-disconnect') {
    return {
      ok: true,
      ...(await fakeControl(session, '/_control/hub-disconnect', {})),
    }
  }

  if (kind === 'hub-update') {
    if (!target || !json) {
      throw new CliError('Usage: ring-ctl emit hub-update <zid|name> <json>', {
        code: 'bad-arguments',
      })
    }
    const state = await fakeControl(session, '/_control/state'),
      device =
        state.hubDevices.find((d: any) => d.zid === target) ??
        state.hubDevices.find(
          (d: any) => String(d.name).toLowerCase() === target.toLowerCase(),
        )
    if (!device) {
      throw new CliError(`No hub device "${target}"`, {
        code: 'unknown-device',
        details: {
          devices: state.hubDevices.map((d: any) => ({
            zid: d.zid,
            name: d.name,
            deviceType: d.deviceType,
          })),
        },
      })
    }
    const result = await fakeControl(session, '/_control/hub-update', {
      zid: device.zid,
      set: parseJsonArg(json, 'The update'),
    })
    return {
      ok: true,
      device: result.device,
      next: [
        'HomeKit reflects this almost immediately; check with `ring-ctl get`.',
      ],
    }
  }

  if (kind === 'camera-update') {
    if (!target || !json) {
      throw new CliError(
        'Usage: ring-ctl emit camera-update <id|name> <json>',
        {
          code: 'bad-arguments',
        },
      )
    }
    const result = await fakeControl(session, '/_control/camera-update', {
      deviceId: target,
      set: parseJsonArg(json, 'The update'),
    })
    return {
      ok: true,
      device: result.device,
      next: [
        'The plugin sees camera changes on its next poll (about 5s in fake mode).',
      ],
    }
  }

  if (kind !== 'ding' && kind !== 'motion') {
    throw new CliError(`Unknown emit kind "${kind}"`, {
      code: 'bad-arguments',
      next: [
        'Use ding, motion, hub-update, camera-update, hub-disconnect or ring-error.',
      ],
    })
  }
  if (!target) {
    throw new CliError(`Usage: ring-ctl emit ${kind} <camera>`, {
      code: 'bad-arguments',
    })
  }

  const state = await fakeControl(session, '/_control/state'),
    candidates = [
      ...state.cameras,
      ...(kind === 'ding' ? state.intercoms ?? [] : []),
    ],
    ringCamera =
      candidates.find((c: any) => String(c.id) === target) ??
      candidates.find(
        (c: any) => String(c.name).toLowerCase() === target.toLowerCase(),
      )
  if (!ringCamera) {
    throw new CliError(
      `No fake ${
        kind === 'ding' ? 'camera or intercom' : 'camera'
      } "${target}"`,
      {
        code: 'unknown-camera',
        details: { candidates },
      },
    )
  }

  const push = () =>
    fakeControl(session, '/_control/push', {
      deviceId: ringCamera.id,
      kind,
      subtype: values.subtype,
    })

  if (values['no-expect']) {
    const result = await push()
    return { ok: true, delivered: result.delivered }
  }

  const list = await accessoriesFor(session),
    chars = allCharacteristics(list).filter(
      (c) => c.accessoryName === ringCamera.name,
    ),
    expected =
      kind === 'ding'
        ? chars.find(
            (c) =>
              c.serviceType === 'Doorbell' &&
              c.name === 'ProgrammableSwitchEvent',
          )
        : chars.find(
            (c) =>
              c.serviceType === 'MotionSensor' && c.name === 'MotionDetected',
          )

  if (!expected) {
    const result = await push()
    return {
      ok: true,
      delivered: result.delivered,
      observed: null,
      note: `${ringCamera.name} has no HomeKit ${
        kind === 'ding' ? 'doorbell' : 'motion sensor'
      } service to observe (hidden by config or not supported by this device).`,
    }
  }

  if (
    kind === 'motion' &&
    sameValue(expected, await readCharacteristic(session.pin, expected), true)
  ) {
    const result = await push()
    return {
      ok: true,
      delivered: result.delivered,
      observed: null,
      note: `${expected.ref} was already true. Ring keeps motion active for ~65s after each event, so HomeKit saw no change. Wait for it to clear before emitting again: \`ring-ctl wait "${expected.ref}" false --timeout 90\``,
    }
  }

  const timeoutMs = numberOption(values.timeout, 10, 'timeout') * 1000,
    { events, actionResult } = await collectEvents(
      session,
      [expected],
      timeoutMs,
      kind === 'motion'
        ? { target: expected, value: true }
        : { target: expected, value: 0 },
      push,
    ),
    delivered = (actionResult as any)?.delivered

  if (!events.length) {
    throw new CliError(
      `The ${kind} was sent but ${expected.ref} did not change within ${
        timeoutMs / 1000
      }s`,
      {
        code: 'not-observed',
        details: { delivered },
        next: [
          ...(delivered && kind === 'ding'
            ? [
                'The plugin passes at most one doorbell press per 15 seconds per device. If you emitted a ding recently, wait 15s and emit again.',
              ]
            : []),
          delivered
            ? 'The push reached the plugin. Check `ring-ctl logs --grep ding` for how it was handled.'
            : 'No push client was connected. Check `ring-ctl ring-state --section events` and the push stub.',
        ],
      },
    )
  }
  return { ok: true, delivered, observed: events }
}

async function ringState(argv: string[]) {
  const { values } = parse(argv, { section: { type: 'string' } }),
    session = requireSession({ mode: 'fake' }),
    state = await fakeControl(session, '/_control/state'),
    sections: Record<string, string> = {
      events: 'events',
      requests: 'recentRequests',
      unhandled: 'unhandled',
      faults: 'faults',
      hub: 'hubDevices',
      cameras: 'cameras',
      intercoms: 'intercoms',
      locations: 'locations',
      hubMessages: 'recentHubMessages',
    }
  if (!values.section) {
    return { ok: true, ...state }
  }
  const key = sections[values.section]
  if (!key) {
    throw new CliError(`Unknown section "${values.section}"`, {
      code: 'bad-arguments',
      next: [`Use one of: ${Object.keys(sections).join(', ')}`],
    })
  }
  return { ok: true, [values.section]: state[key] }
}

async function restore(argv: string[]) {
  const { values } = parse(argv, {
      'allow-unlock': { type: 'boolean' },
      abandon: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    }),
    pending = pendingWrites()

  if (values['dry-run']) {
    return {
      ok: true,
      dryRun: true,
      pendingLiveWrites: pending.map((p) => ({
        seq: p.seq,
        ref: p.ref,
        before: p.before,
        after: p.after,
      })),
      next: pending.length
        ? [
            'Writes to the same characteristic are restored once, to the oldest "before". Restoring to an unlocked lock is skipped without --allow-unlock.',
          ]
        : undefined,
    }
  }

  if (values.abandon) {
    recordResolution(
      pending.map((p) => p.seq),
      'skipped',
      'abandoned with ring-ctl restore --abandon',
    )
    return {
      ok: true,
      abandoned: pending.map((p) => ({
        ref: p.ref,
        before: p.before,
        after: p.after,
      })),
      next: [
        'Tell the user which of these may still differ from how they left them.',
      ],
    }
  }

  const session = readSession()
  if (!session || !isSessionActive(session) || session.mode !== 'live') {
    if (!pending.length) {
      return { ok: true, pendingLiveWrites: 0 }
    }
    throw new CliError('Restoring needs a running live session', {
      code: 'no-session',
      details: { pendingLiveWrites: pending.length },
      next: [
        '`ring-ctl launch live` restores pending writes automatically before it reports ready.',
      ],
    })
  }
  requireSession({ mode: 'live' })
  return restoreLive({
    topology: await topologyFor(session),
    runDir: session.runDir,
    runId: session.runId,
    allowUnlock: values['allow-unlock'],
  })
}

const logSources: Record<string, string> = {
  homebridge: 'homebridge.log',
  supervisor: 'supervisor.log',
  guard: 'guard.jsonl',
  listeners: 'listeners.jsonl',
  fake: 'fake-ring.jsonl',
}

async function logs(argv: string[]) {
  const { values } = parse(argv, {
      source: { type: 'string' },
      lines: { type: 'string' },
      grep: { type: 'string' },
    }),
    session = readSession()
  if (!session) {
    throw new CliError('No session has run in this checkout yet', {
      code: 'no-session',
    })
  }
  const source = values.source ?? 'homebridge',
    fileName = logSources[source]
  if (!fileName) {
    throw new CliError(`Unknown log source "${source}"`, {
      code: 'bad-arguments',
      next: [`Use one of: ${Object.keys(logSources).join(', ')}`],
    })
  }
  const file = join(session.runDir, fileName),
    pattern = values.grep ? new RegExp(values.grep, 'i') : undefined,
    count = numberOption(values.lines, 100, 'lines'),
    all = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [],
    matching = all.filter((l) => l && (!pattern || pattern.test(l)))
  return {
    ok: true,
    file,
    totalLines: matching.length,
    lines: matching.slice(-count),
  }
}

async function cleanup(argv: string[]) {
  const { values } = parse(argv, {
      storage: { type: 'boolean' },
      evidence: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    }),
    dryRun = values['dry-run'],
    session = readSession(),
    stopped = dryRun
      ? { ok: true, wouldStop: session && isSessionActive(session) }
      : await stopSession(),
    removed: string[] = [],
    remove = (dir: string) => {
      if (!dryRun) {
        rmSync(dir, { recursive: true, force: true })
      }
      removed.push(dir)
    }

  if (values.storage) {
    for (const mode of ['fake', 'live'] as const) {
      const dir = storageDirFor(mode)
      if (existsSync(dir)) {
        remove(dir)
      }
    }
    const plugin = join(checkoutDir, 'plugin')
    if (existsSync(plugin)) {
      remove(plugin)
    }
  }
  if (values.evidence && existsSync(evidenceRoot)) {
    const keep = readSession()?.runDir
    for (const entry of readdirSync(evidenceRoot)) {
      const dir = join(evidenceRoot, entry)
      if (dir !== keep) {
        remove(dir)
      }
    }
  }
  return dryRun
    ? { ok: true, dryRun: true, stopped, wouldRemove: removed }
    : { ok: stopped.ok, stopped, removed }
}

async function token(argv: string[]) {
  const [action] = argv
  if (action === 'status') {
    return {
      ok: true,
      present: existsSync(liveTokenFile),
      file: liveTokenFile,
      updatedAt: existsSync(liveTokenFile)
        ? statSync(liveTokenFile).mtime
        : undefined,
    }
  }
  if (action !== 'import') {
    throw new CliError('Usage: ring-ctl token import|status', {
      code: 'bad-arguments',
    })
  }
  if (process.stdin.isTTY) {
    throw new CliError('Pipe the token in on stdin', {
      code: 'bad-arguments',
      next: [
        '`pbpaste | node .agents/skills/verify-ring/ring-ctl.ts token import` keeps it out of shell history and process lists.',
      ],
    })
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim(),
    // Accept the raw token or the auth-cli output / config snippet.
    match = /"refreshToken"\s*:\s*"([^"]+)"/.exec(text),
    value = match ? match[1] : text
  if (!value || /\s/.test(value) || value.length < 20) {
    throw new CliError('That does not look like a Ring refresh token', {
      code: 'bad-token',
      next: ['Paste only the token printed by `ring-auth-cli.ts`.'],
    })
  }
  mkdirSync(liveDir, { recursive: true, mode: 0o700 })
  writeFileSync(liveTokenFile, value + '\n', { mode: 0o600 })
  return {
    ok: true,
    file: liveTokenFile,
    next: ['Start live verification with `ring-ctl launch live`.'],
  }
}

const commands: Record<string, (argv: string[]) => Promise<unknown>> = {
  doctor: () => doctor(),
  launch,
  status: () => status(),
  stop: () => stopSession(),
  cleanup,
  logs,
  accessories,
  get,
  set,
  wait,
  watch,
  snapshot,
  emit,
  'ring-state': ringState,
  restore,
  token,
}

async function main() {
  const [command, ...argv] = process.argv.slice(2)
  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    process.stdout.write(usage + '\n')
    return
  }
  const handler = commands[command]
  if (!handler) {
    throw new CliError(`Unknown command "${command}"`, {
      code: 'unknown-command',
      next: ['Run `ring-ctl help` for the list of commands.'],
    })
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(usage + '\n')
    return
  }
  if (
    command !== 'token' &&
    command !== 'doctor' &&
    isSessionActive(readSession())
  ) {
    touchHeartbeat()
  }
  printJson(await handler(argv))
}

// stdout is async for pipes on macOS, so exiting right away can truncate a
// large JSON result. Exit once everything written so far has flushed.
function exitAfterFlush(code: number) {
  process.stdout.write('', () => process.exit(code))
}

main().then(
  () => exitAfterFlush(0),
  (error) => {
    printError(error)
    exitAfterFlush(1)
  },
)
