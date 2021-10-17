import { AlarmMode, RingApiOptions } from '../api'
import { readFileSync, writeFileSync } from 'fs'
import { API } from 'homebridge'
import { createHash, randomBytes } from 'crypto'
import { join } from 'path'

const systemIdFileName = '.ring.json'

export interface RingPlatformConfig extends RingApiOptions {
  alarmOnEntryDelay?: boolean
  beamDurationSeconds?: number
  hideLightGroups?: boolean
  hideDoorbellSwitch?: boolean
  hideCameraLight?: boolean
  hideCameraMotionSensor?: boolean
  sendCameraMotionNotificationsToTv?: boolean
  sendDoorbellMotionNotificationsToTv?: boolean
  hideCameraSirenSwitch?: boolean
  hideInHomeDoorbellSwitch?: boolean
  hideAlarmSirenSwitch?: boolean
  hideUnsupportedServices?: boolean
  hideDeviceIds?: string[]
  onlyDeviceTypes?: string[]
  showPanicButtons?: boolean
  nightModeBypassFor: AlarmMode
  ffmpegPath?: string
}

export function updateHomebridgeConfig(
  homebridge: API,
  update: (config: string) => string
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

export function getSystemId(homebridge: API) {
  const storagePath = homebridge.user.storagePath(),
    filePath = join(storagePath, systemIdFileName)

  try {
    const ringContext: RingContext = JSON.parse(
      readFileSync(filePath).toString()
    )
    if (ringContext.systemId) {
      return ringContext.systemId
    }
  } catch (_) {
    // expect errors if file doesn't exist or is in a bad format
  }

  const systemId = createSystemId(),
    ringContext: RingContext = { systemId }

  writeFileSync(filePath, JSON.stringify(ringContext))

  return systemId
}
