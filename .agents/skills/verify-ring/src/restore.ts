// Puts the real Ring account back the way it was before the agent touched it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  allCharacteristics,
  type FlatCharacteristic,
  type HapTopology,
  loadAccessories,
  readCharacteristic,
  readCharacteristics,
  sameValue,
  writeCharacteristic,
} from './hap.ts'
import {
  archiveJournal,
  type CharacteristicKey,
  keyFor,
  pendingWrites,
  recordResolution,
  type WriteEntry,
} from './journal.ts'
import { delay } from './output.ts'
import { liveBaselineFile } from './paths.ts'
import { checkLiveWrite, grantPermits } from './policy.ts'

export interface RestoreItem {
  ref: string
  seqs: number[]
  before: unknown
  current?: unknown
  result: 'restored' | 'unchanged' | 'skipped' | 'failed'
  reason?: string
}

export interface DriftItem {
  ref: string
  baseline: unknown
  current: unknown
}

export interface RestoreReport {
  at: string
  ok: boolean
  items: RestoreItem[]
  drift: DriftItem[]
  journal?: string
}

interface Baseline {
  runId: string
  capturedAt: string
  values: { ref: string; key: CharacteristicKey; value: unknown }[]
}

function keyMatches(char: FlatCharacteristic, key: CharacteristicKey) {
  return (
    char.serviceType === key.serviceType &&
    char.serviceLabel === key.serviceLabel &&
    char.name === key.name &&
    (key.accessorySerial
      ? char.accessorySerial === key.accessorySerial
      : char.accessoryName === key.accessoryName)
  )
}

export function findByKey(
  chars: FlatCharacteristic[],
  key: CharacteristicKey,
  ref: string,
) {
  const matches = chars.filter((c) => keyMatches(c, key))
  if (matches.length === 1) {
    return matches[0]
  }
  return chars.find((c) => c.ref === ref)
}

// Writable characteristics are the state an agent can change, so they are
// what a restore must put back and what drift is measured against.
function isRestorable(char: FlatCharacteristic) {
  return char.perms.includes('pw') && char.perms.includes('pr')
}

export async function captureBaseline(
  topology: HapTopology,
  runId: string,
  runDir: string,
) {
  const accessories = await loadAccessories(topology),
    targets = allCharacteristics(accessories).filter(isRestorable),
    values = await readCharacteristics(topology.pin, targets),
    baseline: Baseline = {
      runId,
      capturedAt: new Date().toISOString(),
      values: targets.map((target) => ({
        ref: target.ref,
        key: keyFor(target),
        value: values.get(target),
      })),
    }
  mkdirSync(runDir, { recursive: true })
  mkdirSync(dirname(liveBaselineFile), { recursive: true })
  writeFileSync(liveBaselineFile, JSON.stringify(baseline, null, 2), {
    mode: 0o600,
  })
  writeFileSync(
    join(runDir, 'baseline.json'),
    JSON.stringify(baseline, null, 2),
  )
  return baseline
}

function readBaseline(): Baseline | undefined {
  try {
    return JSON.parse(readFileSync(liveBaselineFile, 'utf8'))
  } catch {
    return undefined
  }
}

async function waitForValue(
  pin: string,
  target: FlatCharacteristic,
  expected: unknown,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs
  let current: unknown
  do {
    current = await readCharacteristic(pin, target)
    if (sameValue(target, current, expected)) {
      return { matched: true, current }
    }
    await delay(500)
  } while (Date.now() < deadline)
  return { matched: false, current }
}

async function restoreOne(
  pin: string,
  chars: FlatCharacteristic[],
  first: WriteEntry,
  seqs: number[],
  allowUnlock: boolean,
): Promise<RestoreItem> {
  const item: RestoreItem = {
    ref: first.ref,
    seqs,
    before: first.before,
    result: 'failed',
  }

  if (!first.beforeReadable) {
    item.result = 'skipped'
    item.reason = 'The value before the write could not be read.'
    return item
  }

  const target = findByKey(chars, first.key, first.ref)
  if (!target) {
    item.reason =
      'The characteristic no longer exists. The device may be offline or the accessory was removed.'
    return item
  }
  item.ref = target.ref

  const current = await readCharacteristic(pin, target)
  item.current = current
  if (sameValue(target, current, first.before)) {
    item.result = 'unchanged'
    return item
  }

  // Restoring re-arms freely (that is the safe direction) but never sounds a
  // siren, and only unlocks a door when explicitly asked to.
  const decision = checkLiveWrite(target, first.before, {
    allowArm: true,
    allowUnlock,
  })
  if (!decision.allowed) {
    item.result = 'skipped'
    item.reason =
      decision.requires === 'unlock'
        ? 'Left locked. Restoring would unlock a real door; run `ring-ctl restore --allow-unlock` or unlock it in the Ring app.'
        : decision.reason
    return item
  }

  grantPermits(decision.permits)
  const write = await writeCharacteristic(pin, target, first.before)
  if (!write.ok) {
    item.reason = `HAP write failed (http ${write.httpStatus}, hap status ${write.hapStatus})`
    return item
  }

  const confirmed = await waitForValue(pin, target, first.before, 15_000)
  item.current = confirmed.current
  if (!confirmed.matched) {
    item.reason =
      'The write was accepted but the value did not read back within 15s.'
    return item
  }

  item.result = 'restored'
  return item
}

export async function restoreLive({
  topology,
  runDir,
  runId,
  allowUnlock = false,
}: {
  topology: HapTopology
  runDir: string
  runId?: string
  allowUnlock?: boolean
}): Promise<RestoreReport> {
  const pending = pendingWrites(),
    accessories = await loadAccessories(topology),
    chars = allCharacteristics(accessories),
    groups = new Map<string, WriteEntry[]>()

  for (const entry of pending) {
    const id = JSON.stringify(entry.key)
    groups.set(id, [...(groups.get(id) ?? []), entry])
  }

  // Undo in reverse order of first change, restoring each characteristic to
  // the value it had before the first write to it.
  const ordered = [...groups.values()]
      .map((entries) => entries.sort((a, b) => a.seq - b.seq))
      .sort((a, b) => b[0].seq - a[0].seq),
    items: RestoreItem[] = []

  for (const entries of ordered) {
    const seqs = entries.map((e) => e.seq)
    let item: RestoreItem
    try {
      item = await restoreOne(
        topology.pin,
        chars,
        entries[0],
        seqs,
        allowUnlock,
      )
    } catch (e) {
      item = {
        ref: entries[0].ref,
        seqs,
        before: entries[0].before,
        result: 'failed',
        reason: e instanceof Error ? e.message : String(e),
      }
    }
    items.push(item)
    if (item.result === 'failed') {
      recordResolution(seqs, 'failed', item.reason)
    } else {
      recordResolution(
        seqs,
        item.result === 'skipped' ? 'skipped' : 'restored',
        item.reason,
      )
    }
  }

  const drift: DriftItem[] = [],
    baseline = readBaseline()
  if (baseline && (!runId || baseline.runId === runId)) {
    const targets = baseline.values
        .map((b) => ({ b, target: findByKey(chars, b.key, b.ref) }))
        .filter(
          (
            x,
          ): x is {
            b: Baseline['values'][number]
            target: FlatCharacteristic
          } => Boolean(x.target),
        ),
      current = await readCharacteristics(
        topology.pin,
        targets.map((t) => t.target),
      )
    for (const { b, target } of targets) {
      const value = current.get(target)
      if (!sameValue(target, value, b.value)) {
        drift.push({ ref: target.ref, baseline: b.value, current: value })
      }
    }
  }

  const ok = items.every((i) => i.result !== 'failed'),
    report: RestoreReport = {
      at: new Date().toISOString(),
      ok,
      items,
      drift,
    }

  if (ok) {
    report.journal = archiveJournal(join(runDir, 'journal.jsonl'))
  }

  mkdirSync(runDir, { recursive: true })
  writeFileSync(
    join(runDir, `restore-${report.at.replace(/[:.]/g, '-')}.json`),
    JSON.stringify(report, null, 2),
  )
  return report
}
