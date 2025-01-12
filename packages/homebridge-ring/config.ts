import type { AlarmMode, RingApiOptions } from 'ring-client-api'
import { readFileSync, writeFileSync } from 'fs'
import type { API } from 'homebridge'
import { createHash, randomBytes } from 'crypto'
import { join } from 'path'

const systemIdFileName = '.ring.json'
export const controlCenterDisplayName = 'homebridge-ring'

export interface RingPlatformConfig extends RingApiOptions {
  alarmOnEntryDelay?: boolean
  beamDurationSeconds?: number
  ffmpegPath?: string
  hideLightGroups?: boolean
  hideDoorbellSwitch?: boolean
  hideCameraLight?: boolean
  hideCameraMotionSensor?: boolean
  hideCameraSirenSwitch?: boolean
  hideInHomeDoorbellSwitch?: boolean
  hideAlarmSirenSwitch?: boolean
  hideDeviceIds?: string[]
  nightModeBypassFor: AlarmMode
  onlyDeviceTypes?: string[]
  showPanicButtons?: boolean
  disableLogs?: boolean
}

export function updateHomebridgeConfig(
  homebridge: API,
  update: (config: string) => string,
) {
  const configPath = homebridge.user.configPath(),
    config = readFileSync(configPath).toString(),
    updatedConfig = update(config)

  if (config !== updatedConfig) {
    writeFileSync(configPath, updatedConfig)
    return true
  }

  return false
}

function createSystemId() {
  return createHash('sha256').update(randomBytes(32)).digest('hex')
}

interface RingContext {
  systemId: string
}

export function getSystemId(homebridgeStoragePath: string) {
  const filePath = join(homebridgeStoragePath, systemIdFileName)

  try {
    const ringContext: RingContext = JSON.parse(
      readFileSync(filePath).toString(),
    )
    if (ringContext.systemId) {
      return ringContext.systemId
    }
  } catch {
    // expect errors if file doesn't exist or is in a bad format
  }

  const systemId = createSystemId(),
    ringContext: RingContext = { systemId }

  writeFileSync(filePath, JSON.stringify(ringContext))

  return systemId
}

export const debug = process.env.RING_DEBUG === 'true'
