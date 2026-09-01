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

  // ── Ring Intercom ───────────────────────────────────────────────────────────
  /** Contact sensor that reports when the Intercom loses its connection. */
  showOfflineSensor?: boolean
  /** Switch that unsubscribes from ding alerts on Ring's servers. */
  showDoNotDisturbSwitch?: boolean
  /** Logs every Intercom ding and unlock to a JSONL file, unthrottled. */
  logIntercomDings?: boolean
  /** Folder for that log. Defaults to the Homebridge storage directory. */
  intercomDingLogPath?: string
  /** Camera accessory with a still image and two-way audio for the Intercom. */
  enableIntercomAudio?: boolean
  /** dB added to the voice going out to the intercom speaker. */
  intercomSpeakerGainDb?: number
  /** dB added to the audio coming in from the intercom. */
  intercomMicGainDb?: number
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
