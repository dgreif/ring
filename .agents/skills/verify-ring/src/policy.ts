// Live-mode safety rules. The CLI checks HAP writes before sending them, and
// the Homebridge preload checks every outgoing Ring request as a backstop, so
// nothing the plugin does (including bugs) can sound a siren, dispatch an
// alarm or arm/unlock without an explicit, short-lived permit.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { livePermitFile } from './paths.ts'

export type Permit = 'arm' | 'unlock'

export interface WriteTarget {
  accessoryName: string
  serviceType: string
  serviceLabel: string
  name: string
}

export interface WriteDecision {
  allowed: boolean
  reason?: string
  permits: Permit[]
  requires?: Permit
}

const securitySystemArmValues = new Set([0, 1, 2]),
  lockUnsecured = 0

function isSirenTarget(target: WriteTarget) {
  return /siren/i.test(target.accessoryName + ' ' + target.serviceLabel)
}

function isPanicTarget(target: WriteTarget) {
  return /panic|burglar alarm|fire alarm/i.test(
    target.accessoryName + ' ' + target.serviceLabel,
  )
}

export function checkLiveWrite(
  target: WriteTarget,
  value: unknown,
  flags: { allowArm?: boolean; allowUnlock?: boolean },
): WriteDecision {
  if (isPanicTarget(target)) {
    return {
      allowed: false,
      reason:
        'Panic buttons dispatch a real alarm (and possibly police/fire) and are never allowed in live mode.',
      permits: [],
    }
  }

  if (isSirenTarget(target) && target.name === 'On' && value !== false) {
    return {
      allowed: false,
      reason:
        'Turning on a siren is never allowed in live mode. Turning one off is allowed.',
      permits: [],
    }
  }

  if (
    target.name === 'SecuritySystemTargetState' &&
    securitySystemArmValues.has(Number(value))
  ) {
    return flags.allowArm
      ? { allowed: true, permits: ['arm'] }
      : {
          allowed: false,
          requires: 'arm',
          reason:
            'Arming a real alarm or location mode requires --allow-arm. Disarm (DISARM / 3) is always allowed.',
          permits: [],
        }
  }

  if (target.name === 'LockTargetState' && Number(value) === lockUnsecured) {
    return flags.allowUnlock
      ? { allowed: true, permits: ['unlock'] }
      : {
          allowed: false,
          requires: 'unlock',
          reason:
            'Unlocking a real door requires --allow-unlock. Locking is always allowed.',
          permits: [],
        }
  }

  return { allowed: true, permits: [] }
}

export function grantPermits(permits: Permit[], ttlMs = 30_000) {
  if (!permits.length) {
    return
  }
  const expiresAt = Date.now() + ttlMs,
    current = readPermits()
  for (const permit of permits) {
    current[permit] = expiresAt
  }
  mkdirSync(dirname(livePermitFile), { recursive: true })
  writeFileSync(livePermitFile, JSON.stringify(current), { mode: 0o600 })
}

export function clearPermits() {
  rmSync(livePermitFile, { force: true })
}

export function readPermits(): Partial<Record<Permit, number>> {
  try {
    return JSON.parse(readFileSync(livePermitFile, 'utf8'))
  } catch {
    return {}
  }
}

export function hasPermit(permit: Permit) {
  const expiresAt = readPermits()[permit]
  return typeof expiresAt === 'number' && expiresAt > Date.now()
}

export interface GuardDecision {
  action: 'allow' | 'block'
  reason?: string
  permit?: Permit
}

function needsPermit(permit: Permit, reason: string): GuardDecision {
  return hasPermit(permit)
    ? { action: 'allow', reason: `${reason} (permit: ${permit})`, permit }
    : {
        action: 'block',
        reason: `${reason} without an ${permit} permit`,
        permit,
      }
}

// HTTP requests to Ring. `body` is the parsed JSON body when available.
export function checkRingRequest(
  method: string,
  url: URL,
  body: any,
): GuardDecision {
  const path = url.pathname,
    upperMethod = method.toUpperCase()

  if (upperMethod === 'GET' || upperMethod === 'HEAD') {
    return { action: 'allow' }
  }

  if (/\/userAlarm$/.test(path)) {
    return {
      action: 'block',
      reason: 'alarm dispatch (panic / userAlarm)',
    }
  }

  if (/\/siren_on$/.test(path)) {
    return { action: 'block', reason: 'camera siren on' }
  }

  if (/\/mode\/location\/[^/]+\/(settings|sharing)/.test(path)) {
    return {
      action: 'block',
      reason: 'changing location mode settings or sharing',
    }
  }

  if (/\/mode\/location\/[^/]+$/.test(path)) {
    const mode = body?.mode
    if (mode === 'disarmed') {
      return { action: 'allow', reason: 'location mode disarmed' }
    }
    return needsPermit('arm', `location mode "${mode ?? 'unknown'}"`)
  }

  if (/\/device_rpc$/.test(path)) {
    const rpcMethod = body?.request?.method ?? body?.method
    if (rpcMethod === 'unlock_door' || body === undefined) {
      return needsPermit('unlock', 'intercom unlock_door')
    }
  }

  return { action: 'allow' }
}

const blockedHubCommand =
  /sound-siren|siren[.-]on|panic|trigger|alarm[.-]on|police|fire-alarm|medical|burglar/i

// Messages sent on the location hub WebSocket (alarm + Beams).
export function checkHubMessage(raw: string): GuardDecision {
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { action: 'allow' }
  }

  const message = parsed?.msg
  if (message?.msg !== 'DeviceInfoSet') {
    return { action: 'allow' }
  }

  for (const item of message.body ?? []) {
    for (const command of item.command?.v1 ?? []) {
      const commandType = String(command.commandType ?? '')
      if (commandType === 'security-panel.silence-siren') {
        continue
      }
      if (blockedHubCommand.test(commandType)) {
        return {
          action: 'block',
          reason: `hub command ${commandType} on ${item.zid}`,
        }
      }
      if (commandType === 'security-panel.switch-mode') {
        const mode = command.data?.mode
        if (mode !== 'none') {
          return needsPermit('arm', `alarm mode "${mode}"`)
        }
      }
      if (commandType === 'lock.unlock') {
        return needsPermit('unlock', `lock.unlock on ${item.zid}`)
      }
    }

    const deviceSet = item.device?.v1
    if (deviceSet && typeof deviceSet === 'object') {
      if ('siren' in deviceSet || 'alarmInfo' in deviceSet) {
        return {
          action: 'block',
          reason: `hub device update touching siren/alarm on ${item.zid}`,
        }
      }
    }
  }

  return { action: 'allow' }
}
