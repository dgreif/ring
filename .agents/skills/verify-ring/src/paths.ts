import { createHash } from 'node:crypto'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const repoRoot = resolve(skillDir, '../../..')
export const homebridgeRingDir = join(repoRoot, 'packages/homebridge-ring')
export const ringClientApiDir = join(repoRoot, 'packages/ring-client-api')

// Every checkout (main clone or worktree) gets its own Homebridge storage,
// ports and evidence folder so parallel agents never collide.
export const checkoutHash = createHash('sha256')
  .update(repoRoot)
  .digest('hex')
  .slice(0, 10)

export const verifyHome =
  process.env.RING_VERIFY_HOME || join(homedir(), '.ring-verify')

// Live mode state is account-wide, not per checkout: one token, one lock,
// one journal of writes that must be restored.
export const liveDir = join(verifyHome, 'live')
export const liveTokenFile = join(liveDir, 'refresh-token')
export const liveSystemIdFile = join(liveDir, 'ring.json')
export const liveLockFile = join(liveDir, 'lock.json')
export const liveJournalFile = join(liveDir, 'journal.jsonl')
export const liveBaselineFile = join(liveDir, 'baseline.json')
export const livePermitFile = join(liveDir, 'permit.json')

export const checkoutDir = join(verifyHome, 'checkouts', checkoutHash)
export const sessionFile = join(checkoutDir, 'session.json')
export const heartbeatFile = join(checkoutDir, 'heartbeat')

export function storageDirFor(mode: 'live' | 'fake') {
  return join(checkoutDir, `storage-${mode}`)
}

export const pluginShimDir = join(checkoutDir, 'plugin', 'homebridge-ring')

export const evidenceRoot = join(
  process.env.RING_VERIFY_EVIDENCE_DIR ||
    join(process.platform === 'win32' ? tmpdir() : '/tmp', 'verify-ring'),
  checkoutHash,
)

// The JS entry point, not node_modules/.bin/homebridge: pnpm bins are shell shims
// and this path is passed to node.
export const homebridgeBin = join(
  homebridgeRingDir,
  'node_modules/homebridge/bin/homebridge.js',
)

// A block of 32 ports per checkout: bridge, fake cloud, then external
// accessories (cameras are published outside the bridge, one port each).
export const portBlockSize = 32

export function preferredPortBase() {
  const slot = parseInt(checkoutHash.slice(0, 6), 16) % 300
  return 42000 + slot * portBlockSize
}
