import { LocationAddress } from './index'

export enum RingDeviceType {
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
  SmokeCoListener = 'listener.smoke-co',
  MultiLevelSwitch = 'switch.multilevel',
  BeamsMotionSensor = 'motion-sensor.beams',
  BeamsSwitch = 'switch.multilevel.beams',
  BeamsLightGroupSwitch = 'group.light-group.beams',
  BeamsTransformerSwitch = 'switch.transformer.beams'
}

export type AlarmMode = 'all' | 'some' | 'none'
export type MessageType =
  | 'RoomGetList'
  | 'SessionInfo'
  | 'DeviceInfoDocGetList'
  | 'DeviceInfoSet'
export type MessageDataType =
  | 'RoomListV2Type'
  | 'SessionInfoType'
  | 'DeviceInfoDocType'
  | 'DeviceInfoSetType'
  | 'HubDisconnectionEventType'

export interface SocketIoMessage {
  msg: MessageType
  datatype: MessageDataType
  src: string
  body: any[]
}

export type AssetKind = 'base_station_v1' | 'beams_bridge_v1'

export interface AssetSession {
  assetUuid: string
  connectionStatus: 'unknown' | 'cell-backup' | 'online'
  doorbotId: number
  kind: AssetKind
  sessionId: number
}

export type AlarmState =
  | 'burglar-alarm' // Ring is Alarming
  | 'entry-delay' // Alarm will sound in ${timeLeft} seconds
  | 'fire-alarm' // Alarming - Smoke
  | 'co-alarm' // Alarming - CO
  | 'panic' // Panic Triggered
  | 'user-verified-burglar-alarm' // Alarming - User Verified Police
  | 'user-verified-co-or-fire-alarm' // Alarming - User Verified Smoke or CO
  | 'burglar-accelerated-alarm' // Alarming - Police Response Requested
  | 'fire-accelerated-alarm' // Alarming - Fire Department Response Requested

export interface RingDeviceData {
  zid: string
  name: string
  deviceType: RingDeviceType
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
  siren?: { state: 'on' | 'off' }
  alarmStatus?: 'active'
  co?: { alarmStatus?: 'active' }
  smoke?: { alarmStatus?: 'active' }
  motionStatus?: 'clear' | 'faulted'
  groupId?: string

  // switch
  on?: boolean
  // switch.multilevel
  level?: number // 0 - 1
  hs?: {
    hue?: number // 0 - 1
    sat?: number // 0 - 1
  }
  ct?: number // 0 - 1
}

export const deviceTypesWithVolume = [
  RingDeviceType.BaseStation,
  RingDeviceType.Keypad
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

export interface BeamBridge {
  created_at: string
  description: string
  hardware_id: string
  id: number
  kind: string
  location_id: string
  metadata: { ethernet: boolean; legacy_fw_migrated: boolean }
  owner_id: number
  role: string
  updated_at: string
}

export interface LocationAddress {
  address1: string
  address2: string
  cross_street: string
  city: string
  state: string
  timezone: string
  zip_code: string
}

export interface UserLocation {
  address: LocationAddress
  created_at: string
  geo_coordinates: { latitude: string; longitude: string }
  geo_service_verified: 'address_only' | string
  location_id: string
  name: string
  owner_id: number
  updated_at: string
  user_verified: boolean
}

export interface TicketAsset {
  doorbotId: number
  kind: AssetKind
  onBattery: boolean
  status: 'online' | 'offline'
  uuid: string
}
