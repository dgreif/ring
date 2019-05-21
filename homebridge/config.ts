import { RingAlarmOptions } from '../api'

export interface RingAlarmPlatformConfig extends RingAlarmOptions {
  alarmOnEntryDelay?: boolean
  beamDurationSeconds?: number
}
