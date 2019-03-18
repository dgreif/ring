export enum AlarmDeviceType {
  BaseStation = 'hub.redsky',
  Keypad = 'security-keypad',
  SecurityPanel = 'security-panel',
  ContactSensor = 'sensor.contact',
  MotionSensor = 'sensor.motion',
  RangeExtender = 'range-extender.zwave',
  ZigbeeAdapter = 'adapter.zigbee',
  AccessCodeVault = 'access-code.vault',
  AccessCode = 'access-code',
  SmokeAlarm = 'alarm.smoke',
  CoAlarm = 'alarm.co',
  SmokeCoListener = 'listener.smoke-co'
}

export type AlarmMode = 'all' | 'some' | 'none'
export type MessageType = 'RoomGetList' | 'SessionInfo' | 'DeviceInfoDocGetList'
export type MessageDataType =
  | 'RoomListV2Type'
  | 'SessionInfoType'
  | 'DeviceInfoDocType'
  | 'HubDisconnectionEventType'

export interface SocketIoMessage {
  msg: MessageType
  datatype: MessageDataType
  body: any[]
}

export type AlarmState =
  | 'burglar-alarm'
  | 'entry-delay'
  | 'fire-alarm'
  | 'co-alarm'
  | 'panic'
  | 'user-verified-co-or-fire-alarm'
  | 'user-verified-burglar-alarm'

export interface AlarmDeviceData {
  zid: string
  name: string
  deviceType: AlarmDeviceType
  batteryLevel?: number
  batteryStatus: 'full' | 'ok' | 'low' | 'none' | 'charging'
  batteryBackup?: 'charged' | 'charging'
  manufacturerName?: string
  serialNumber?: string
  tamperStatus: 'ok' | 'tamper'
  faulted?: boolean
  locked?: 'jammed' | 'locked' | 'unlocked' | 'unknown'
  roomId?: number
  volume?: number
  mode?: AlarmMode
  transitionDelayEndTimestamp?: number | null
  alarmInfo?: {
    state: AlarmState
    faultedDevices?: string[]
    timestamp?: number
    uuid?: string
  }
  alarmStatus?: 'active'
  co?: { alarmStatus?: 'active' }
  smoke?: { alarmStatus?: 'active' }
}

export const deviceTypesWithVolume = [
  AlarmDeviceType.BaseStation,
  AlarmDeviceType.Keypad
]

export interface BaseStation {
  address: string
  alerts: any[]
  description: string
  device_id: string
  features: null
  firmware_version: string
  id: number
  kind: string
  latitude: number
  location_id: string
  longitude: number
  owned: boolean
  owner?: {
    id: number
    email: string
    first_name: string
    last_name: string
  }
  ring_id: null
  settings: null
  stolen: boolean
  time_zone: string
}
