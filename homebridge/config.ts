import { RingApiOptions } from '../api'

export interface RingPlatformConfig extends RingApiOptions {
  alarmOnEntryDelay?: boolean
  beamDurationSeconds?: number
  hideLightGroups?: boolean
  hideDoorbellSwitch?: boolean
  hideCameraMotionSensor?: boolean
  hideCameraSirenSwitch?: boolean
  hideAlarmSirenSwitch?: boolean
  showPanicButtons?: boolean
}
