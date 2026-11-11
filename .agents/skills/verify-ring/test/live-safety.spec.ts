import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  allCharacteristics,
  loadAccessories,
  type HapTopology,
} from '../src/hap.ts'

// Neither the CLI subprocesses nor restoreLive may touch the user's live state.
const testHome = mkdtempSync(join(tmpdir(), 'ring-live-safety-'))
vi.stubEnv('RING_VERIFY_HOME', testHome)
vi.stubEnv('RING_VERIFY_EVIDENCE_DIR', join(testHome, 'evidence'))
const { liveDir, liveJournalFile, livePermitFile, checkoutDir, skillDir } =
    await import('../src/paths.ts'),
  { keyFor, pendingWrites, readJournal, recordResolution, recordWrite } =
    await import('../src/journal.ts'),
  { restoreLive } = await import('../src/restore.ts'),
  { updateSession, writeSession } = await import('../src/session.ts'),
  runDir = join(testHome, 'run')

type ReadMode =
  | 'value'
  | 'error'
  | 'null'
  | 'missing-value'
  | 'missing-item'
  | 'invalid'

let server: Server,
  topology: HapTopology,
  current: unknown,
  readMode: ReadMode,
  writableOnly: boolean,
  lock: boolean,
  failWrite: boolean,
  failReadback: boolean,
  writes: unknown[],
  journalsAtWrite: ReturnType<typeof readJournal>[]

function cli(...args: string[]) {
  return new Promise<{ code: number | null; output: Record<string, unknown> }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        [join(skillDir, 'ring-ctl.ts'), ...args],
        {
          env: { ...process.env, RING_VERIFY_HOME: testHome },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let stdout = '',
        stderr = ''
      child.stdout.on('data', (data) => (stdout += data))
      child.stderr.on('data', (data) => (stderr += data))
      child.on('error', reject)
      child.on('close', (code) => {
        try {
          resolve({ code, output: JSON.parse(stdout) })
        } catch {
          reject(new Error(`CLI returned invalid JSON: ${stdout}\n${stderr}`))
        }
      })
    },
  )
}

async function journal(before: unknown, beforeReadable = true) {
  const [target] = allCharacteristics(await loadAccessories(topology)).filter(
    (c) => c.name === (lock ? 'LockTargetState' : 'On'),
  )
  return recordWrite({
    runId: 'test',
    ref: target.ref,
    key: keyFor(target),
    before,
    beforeReadable,
    after: current,
  })
}

beforeEach(async () => {
  current = 0
  readMode = 'value'
  writableOnly = false
  lock = false
  failWrite = false
  failReadback = false
  writes = []
  journalsAtWrite = []
  mkdirSync(runDir, { recursive: true })
  server = createServer(async (req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/hap+json' })
      res.end(JSON.stringify(body))
    }
    if (req.url === '/accessories') {
      json(200, {
        accessories: [
          {
            aid: 2,
            services: [
              {
                iid: 1,
                type: '3E',
                characteristics: [
                  { iid: 2, type: '23', value: 'Test Device', perms: ['pr'] },
                  { iid: 3, type: '30', value: 'test-serial', perms: ['pr'] },
                ],
              },
              {
                iid: 10,
                type: lock ? '45' : '43',
                characteristics: [
                  {
                    iid: 11,
                    type: lock ? '1E' : '25',
                    format: lock ? 'uint8' : 'bool',
                    perms: writableOnly ? ['pw'] : ['pr', 'pw'],
                    value: current,
                  },
                ],
              },
            ],
          },
        ],
      })
    } else if (req.method === 'GET') {
      json(readMode === 'error' ? 207 : 200, {
        characteristics:
          readMode === 'missing-item'
            ? []
            : [
                {
                  aid: 2,
                  iid: 11,
                  ...(readMode === 'error'
                    ? { status: -70402 }
                    : readMode === 'missing-value'
                    ? { status: 0 }
                    : {
                        value:
                          readMode === 'null'
                            ? null
                            : readMode === 'invalid'
                            ? 'unknown'
                            : current,
                      }),
                },
              ],
      })
    } else if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const body = JSON.parse(Buffer.concat(chunks).toString()),
        value: unknown = body.characteristics[0].value
      writes.push(value)
      journalsAtWrite.push(readJournal())
      if (failWrite) {
        json(207, { characteristics: [{ aid: 2, iid: 11, status: -70402 }] })
      } else {
        current = value
        if (failReadback) {
          readMode = 'error'
        }
        res.writeHead(204)
        res.end()
      }
    } else {
      json(404, { error: 'Unexpected test request' })
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected a TCP server address')
  }
  topology = { bridgePort: address.port, externalPorts: [], pin: '123-45-678' }
  writeSession({
    mode: 'live',
    runId: 'test',
    runDir,
    storageDir: join(testHome, 'storage'),
    portBase: address.port,
    bridgePort: address.port,
    sinkPort: 0,
    externalPorts: { start: 1, end: 0 },
    pin: topology.pin,
    username: '02:00:00:00:00:01',
    debug: false,
    idleMinutes: 15,
    timeoutSeconds: 30,
    platformOverrides: {},
    supervisorPid: process.pid,
    status: 'ready',
    startedAt: new Date().toISOString(),
  })
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  rmSync(liveDir, { recursive: true, force: true })
  rmSync(checkoutDir, { recursive: true, force: true })
  rmSync(runDir, { recursive: true, force: true })
})

afterAll(() => {
  vi.unstubAllEnvs()
  rmSync(testHome, { recursive: true, force: true })
})

describe('live write baselines', () => {
  it.each<ReadMode | 'write-only'>([
    'write-only',
    'error',
    'null',
    'missing-value',
    'missing-item',
    'invalid',
  ])(
    'refuses %s without granting permits, journaling, or writing',
    async (mode) => {
      lock = true
      writableOnly = mode === 'write-only'
      readMode = mode === 'write-only' ? 'value' : mode
      const args = [
          'set',
          'Test Device/LockTargetState',
          'UNSECURED',
          '--allow-unlock',
        ],
        preview = await cli(...args, '--dry-run')
      expect(preview.output).toMatchObject({ allowed: false, journaled: false })
      const result = await cli(...args)
      expect(result.code).toBe(1)
      expect(result.output).toMatchObject({
        ok: false,
        code: 'unreadable-baseline',
      })
      expect(writes).toEqual([])
      expect(existsSync(liveJournalFile)).toBe(false)
      expect(existsSync(livePermitFile)).toBe(false)
    },
  )

  it('journals false before sending writes and restores the oldest baseline', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await cli('set', 'Test Device/On', 'true')).code).toBe(0)
    }
    expect(journalsAtWrite[0]).toMatchObject([
      { type: 'write', before: 0, beforeReadable: true },
    ])
    expect(journalsAtWrite[1]).toHaveLength(2)
    const result = await cli('restore')
    expect(result.code).toBe(0)
    expect(result.output).toMatchObject({
      ok: true,
      items: [{ result: 'restored', before: 0 }],
    })
    expect(current).toBe(0)
    expect(writes).toEqual([true, true, 0])
    expect(pendingWrites()).toEqual([])
    expect(existsSync(liveJournalFile)).toBe(false)
    expect(readJournal(join(runDir, 'journal.jsonl'))).toHaveLength(4)
  })

  it('still permits write-only commands in fake mode', async () => {
    writableOnly = true
    updateSession({ mode: 'fake' })
    expect((await cli('set', 'Test Device/On', 'true')).code).toBe(0)
    expect(writes).toEqual([true])
    expect(pendingWrites()).toEqual([])
  })
})

describe('incomplete restoration', () => {
  it.each([
    { before: 0, beforeReadable: false },
    { before: undefined, beforeReadable: true },
    { before: null, beforeReadable: true },
    { before: { hapStatus: -70402 }, beforeReadable: true },
  ])(
    'retains a legacy unreadable baseline: %j',
    async ({ before, beforeReadable }) => {
      current = 1
      const entry = await journal(before, beforeReadable)
      recordResolution([entry.seq], 'skipped', 'legacy restore skipped')
      const result = await cli('restore')
      expect(result.code).toBe(1)
      expect(result.output).toMatchObject({
        ok: false,
        items: [{ result: 'failed' }],
      })
      expect(result.output.journal).toBeUndefined()
      expect(pendingWrites()).toHaveLength(1)
      expect(writes).toEqual([])
      expect(current).toBe(1)
    },
  )

  it('keeps policy-skipped unlocks pending until explicitly restored', async () => {
    lock = true
    current = 1
    await journal(0)
    const skipped = await cli('restore')
    expect(skipped.code).toBe(1)
    expect(skipped.output).toMatchObject({
      ok: false,
      items: [{ result: 'skipped' }],
    })
    expect(pendingWrites()).toHaveLength(1)
    expect(writes).toEqual([])
    expect(existsSync(liveJournalFile)).toBe(true)
    expect((await cli('restore', '--allow-unlock')).output).toMatchObject({
      ok: true,
      items: [{ result: 'restored' }],
    })
    expect(current).toBe(0)
    expect(pendingWrites()).toEqual([])
  })

  it.each(['read', 'write', 'readback'])(
    'keeps a failed %s pending for retry',
    async (failure) => {
      // An error object is truthy, but must never confirm a true baseline.
      current = 0
      await journal(true)
      readMode = failure === 'read' ? 'error' : 'value'
      failWrite = failure === 'write'
      failReadback = failure === 'readback'
      const report = await restoreLive({ topology, runDir })
      expect(report.ok).toBe(false)
      expect(report.items[0].result).toBe('failed')
      expect(report.journal).toBeUndefined()
      expect(pendingWrites()).toHaveLength(1)
      expect(existsSync(liveJournalFile)).toBe(true)

      readMode = 'value'
      failWrite = false
      failReadback = false
      expect((await restoreLive({ topology, runDir })).ok).toBe(true)
      expect(current).toBe(true)
      expect(pendingWrites()).toEqual([])
    },
    30_000,
  )

  it('reports incomplete recovery on launch reuse, stop, and cleanup, until abandoned', async () => {
    current = 1
    await journal(undefined, false)
    const startupRestore = await restoreLive({ topology, runDir })
    updateSession({ startupRestore })
    const launch = await cli('launch', 'live')
    expect(launch.code).toBe(1)
    expect(launch.output).toMatchObject({
      ok: false,
      code: 'restore-incomplete',
    })

    updateSession({ status: 'stopped' })
    const stopped = await cli('stop')
    expect(stopped.code).toBe(1)
    expect(stopped.output).toMatchObject({
      ok: false,
      wasRunning: false,
      pendingLiveWrites: 1,
    })
    expect(
      (await cli('cleanup', '--storage', '--evidence')).output,
    ).toMatchObject({
      ok: false,
      removed: [],
    })
    expect(existsSync(liveJournalFile)).toBe(true)
    expect((await cli('restore', '--abandon')).code).toBe(0)
    expect(readJournal().at(-1)?.type).toBe('abandoned')
    expect((await cli('stop')).output.ok).toBe(true)
    expect(current).toBe(1)
  })
})
