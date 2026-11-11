// Append-only record of every live-mode write, flushed to disk before the HAP
// write is sent. Anything without a matching "restored" entry is restored by
// `ring-ctl restore`, `ring-ctl stop`, the idle watchdog, or the next launch
// after a crash.
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname } from 'node:path'
import type { FlatCharacteristic } from './hap.ts'
import { liveJournalFile } from './paths.ts'

export interface CharacteristicKey {
  accessoryName: string
  accessorySerial?: string
  serviceType: string
  serviceLabel: string
  name: string
}

export interface WriteEntry {
  type: 'write'
  seq: number
  ts: string
  runId: string
  ref: string
  key: CharacteristicKey
  before: unknown
  beforeReadable: boolean
  after: unknown
}

export interface ResolutionEntry {
  type: 'restored' | 'skipped' | 'failed'
  seq: number
  ts: string
  reason?: string
}

type JournalEntry = WriteEntry | ResolutionEntry

export function keyFor(target: FlatCharacteristic): CharacteristicKey {
  return {
    accessoryName: target.accessoryName,
    accessorySerial: target.accessorySerial,
    serviceType: target.serviceType,
    serviceLabel: target.serviceLabel,
    name: target.name,
  }
}

export function readJournal(file = liveJournalFile): JournalEntry[] {
  if (!existsSync(file)) {
    return []
  }
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as JournalEntry]
      } catch {
        // A torn final line from a crash mid-append. Ignore it.
        return []
      }
    })
}

function append(entry: JournalEntry, file = liveJournalFile) {
  mkdirSync(dirname(file), { recursive: true })
  const fd = openSync(file, 'a', 0o600)
  try {
    writeSync(fd, JSON.stringify(entry) + '\n')
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function recordWrite(
  entry: Omit<WriteEntry, 'type' | 'seq' | 'ts'>,
  file = liveJournalFile,
) {
  const seq = readJournal(file).reduce((max, e) => Math.max(max, e.seq), 0) + 1,
    full: WriteEntry = {
      type: 'write',
      seq,
      ts: new Date().toISOString(),
      ...entry,
    }
  append(full, file)
  return full
}

export function recordResolution(
  seqs: number[],
  type: ResolutionEntry['type'],
  reason?: string,
  file = liveJournalFile,
) {
  for (const seq of seqs) {
    append({ type, seq, ts: new Date().toISOString(), reason }, file)
  }
}

// Writes that still need to be undone. "failed" does not resolve a write:
// the next restore attempt tries it again.
export function pendingWrites(file = liveJournalFile) {
  const entries = readJournal(file),
    resolved = new Set(
      entries
        .filter((e) => e.type === 'restored' || e.type === 'skipped')
        .map((e) => e.seq),
    )
  return entries.filter(
    (e): e is WriteEntry => e.type === 'write' && !resolved.has(e.seq),
  )
}

export function archiveJournal(destination: string, file = liveJournalFile) {
  if (!existsSync(file)) {
    return undefined
  }
  mkdirSync(dirname(destination), { recursive: true })
  if (existsSync(destination)) {
    appendFileSync(destination, readFileSync(file))
    rmSync(file)
  } else {
    renameSync(file, destination)
  }
  return destination
}
