type Firmware = string | 'Up To Date'

export enum RingDeviceType {
  BaseStation = 'hub.redsky',
  Keypad = 'security-keypad',
  SecurityPanel = 'security-panel',
  ContactSensor = 'sensor.contact',
  MotionSensor = 'sensor.motion',
  FloodFreezeSensor = 'sensor.flood-freeze',
  FreezeSensor = 'sensor.freeze',
  TemperatureSensor = 'sensor.temperature',
  RangeExtender = 'range-extender.zwave',
  ZigbeeAdapter = 'adapter.zigbee',
  AccessCodeVault = 'access-code.vault',
  AccessCode = 'access-code',
  SmokeAlarm = 'alarm.smoke',
  CoAlarm = 'alarm.co',
  SmokeCoListener = 'listener.smoke-co',
  MultiLevelSwitch = 'switch.multilevel',
  Fan = 'switch.multilevel',
  MultiLevelBulb = 'switch.multilevel.bulb',
  Switch = 'switch',
  BeamsMotionSensor = 'motion-sensor.beams',
  BeamsSwitch = 'switch.multilevel.beams',
  BeamsLightGroupSwitch = 'group.light-group.beams',
  BeamsTransformerSwitch = 'switch.transformer.beams',
  RetrofitBridge = 'bridge.flatline',
  RetrofitZone = 'sensor.zone',
}

export enum RingDeviceCategory {
  Outlets = 1,
  Lights = 2,
  Sensors = 5,
  Appliances = 7,
  Locks = 10,
  Thermostats = 11,
  Cameras = 12,
  Alarms = 15,
  Fans = 17,
  Security = 22,
  Unknown = 29,
  SensorsMotion = 30,
  Controller = 31,
  RangeExtenders = 32,
  Keypads = 33,
  Sirens = 34,
  PanicButtons = 35,
}

export enum RingCameraKind {
  cocoa_camera = 'cocoa_camera', // appears to be used for all next gen stickup cams (wired/battery/solar)
  doorbot = 'doorbot',
  doorbell = 'doorbell',
  doorbell_v3 = 'doorbell_v3',
  doorbell_v4 = 'doorbell_v4',
  doorbell_v5 = 'doorbell_v5',
  doorbell_portal = 'doorbell_portal',
  lpd_v1 = 'lpd_v1',
  lpd_v2 = 'lpd_v2',
  jbox_v1 = 'jbox_v1',
  stickup_cam = 'stickup_cam',
  stickup_cam_v3 = 'stickup_cam_v3',
  stickup_cam_v4 = 'stickup_cam_v4',
  stickup_cam_elite = 'stickup_cam_elite',
  stickup_cam_lunar = 'stickup_cam_lunar',
  stickup_cam_mini = 'stickup_cam_mini',
  spotlightw_v2 = 'spotlightw_v2',
  hp_cam_v1 = 'hp_cam_v1',
  hp_cam_v2 = 'hp_cam_v2',
  floodlight_v1 = 'floodlight_v1',
  floodlight_v2 = 'floodlight_v2',
}

export const batteryCameraKinds: RingCameraKind[] = [
  RingCameraKind.doorbot,
  RingCameraKind.doorbell,
  RingCameraKind.doorbell_v3,
  RingCameraKind.doorbell_v4,
  RingCameraKind.doorbell_v5,
  RingCameraKind.doorbell_portal,
  RingCameraKind.stickup_cam,
  RingCameraKind.stickup_cam_v3,
  RingCameraKind.stickup_cam_v4,
  RingCameraKind.stickup_cam_lunar,
]

export const RingCameraModel: { readonly [P in RingCameraKind]: string } = {
  cocoa_camera: 'Stick Up Cam',
  doorbot: 'Doorbell',
  doorbell: 'Doorbell',
  doorbell_v3: 'Doorbell',
  doorbell_v4: 'Doorbell 2',
  doorbell_v5: 'Doorbell 2',
  doorbell_portal: 'Door View Cam',
  lpd_v1: 'Doorbell Pro',
  lpd_v2: 'Doorbell Pro',
  jbox_v1: 'Doorbell Elite',
  stickup_cam: 'Stick Up Cam',
  stickup_cam_v3: 'Stick Up Cam',
  stickup_cam_elite: 'Stick Up Cam',
  stickup_cam_lunar: 'Stick Up Cam',
  stickup_cam_mini: 'Indoor Cam',
  spotlightw_v2: 'Spotlight Cam',
  hp_cam_v1: 'Floodlight Cam',
  hp_cam_v2: 'Spotlight Cam',
  stickup_cam_v4: 'Spotlight Cam',
  floodlight_v1: 'Floodlight Cam',
  floodlight_v2: 'Floodlight Cam',
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

export const allAlarmStates: AlarmState[] = [
  'burglar-alarm',
  'entry-delay',
  'fire-alarm',
  'co-alarm',
  'panic',
  'user-verified-burglar-alarm',
  'user-verified-co-or-fire-alarm',
  'burglar-accelerated-alarm',
  'fire-accelerated-alarm',
]

export interface RingDeviceData {
  zid: string
  name: string
  deviceType: RingDeviceType
  categoryId: number
  batteryLevel?: number
  batteryStatus: 'full' | 'charged' | 'ok' | 'low' | 'none' | 'charging'
  batteryBackup?: 'charged' | 'charging' | 'inUse'
  acStatus?: 'error' | 'ok'
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
  flood?: { faulted?: boolean }
  freeze?: { faulted?: boolean }
  motionStatus?: 'clear' | 'faulted'
  groupId?: string
  tags: ('hidden' | 'sleepy' | 'ota-lock' | 'scanned' | 'kitted' | string)[]

  // switch
  on?: boolean
  // switch.multilevel
  level?: number // 0 - 1
  hs?: {
    hue?: number // 0 - 1
    sat?: number // 0 - 1
  }
  ct?: number // 0 - 1
  // Retrofit sensor.zone
  status?: 'enabled' | 'disabled'
  parentZid?: string
  rootDevice?: string
  relToParentZid?: string // '1' - '8'
  //sensor.temperature
  celsius?: number // no F provided, just celsius
  faultHigh?: number
  faultLow?: number
}

export const deviceTypesWithVolume = [
  RingDeviceType.BaseStation,
  RingDeviceType.Keypad,
]

export interface BaseStation {
  address: string
  alerts: any[]
  description: string
  device_id: string
  features: null
  firmware_version: Firmware
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

export enum DoorbellType {
  Mechanical = 0,
  Digital = 1,
  None = 2,
}

export interface CameraData {
  id: number
  description: string
  device_id: string
  time_zone: string
  subscribed: boolean
  subscribed_motions: boolean
  battery_life: number | string | null // 4003 or 100 or "100" or "71"
  battery_life_2?: number | string | null
  battery_voltage?: number
  battery_voltage_2?: number
  external_connection: boolean
  firmware_version: Firmware
  kind: RingCameraKind
  latitude: number
  longitude: number
  address: string
  settings: {
    enable_vod: boolean
    motion_zones: {
      enable_audio: false
      active_motion_filter: number
      sensitivity: number
      advanced_object_settings: any
      zone1: any
      zone2: any
      zone3: any
    }
    motion_snooze_preset_profile: string
    live_view_preset_profile: string
    live_view_presets: string[]
    motion_snooze_presets: string[]
    doorbell_volume: number
    chime_settings?: {
      type: DoorbellType
      enable: boolean
      duration: number
    }
    video_settings: any
    motion_announcement: boolean
    stream_setting: number
    advanced_motion_detection_enabled: boolean
    advanced_motion_detection_human_only_mode: boolean
    luma_night_threshold: number
    enable_audio_recording: boolean | null
    people_detection_eligible: false
    pir_settings?: any
    pir_motion_zones?: number[]
    floodlight_settings?: any
    light_schedule_settings?: any
    luma_light_threshold?: number
  }
  features: {
    motions_enabled: boolean
    show_recordings: boolean
    advanced_motion_enabled: boolean
    people_only_enabled: boolean
    shadow_correction_enabled: boolean
    motion_message_enabled: boolean
    night_vision_enabled: boolean
  }
  owned: boolean
  alerts: {
    connection: 'online' | 'offline' | string
    battery?: 'low' | string
  }
  motion_snooze: {
    scheduled: boolean
  }
  stolen: boolean
  location_id: string
  ring_id: null
  owner: {
    id: number
    email: string
    first_name: string
    last_name: string
  }
  led_status?: 'on' | 'off'
  night_mode_status: 'true' | 'false'
  ring_cam_light_installed?: 'true' | 'false'
  ring_cam_setup_flow?: 'floodlight'
  siren_status?: {
    started_at?: string
    duration?: string
    ends_at?: string
    seconds_remaining: number
  }
}

export interface CameraHealth {
  id: number
  wifi_name: string
  battery_percentage: string
  battery_percentage_category: string
  battery_voltage: number | null
  battery_voltage_category: string | null
  latest_signal_strength: number
  latest_signal_category: string
  average_signal_strength: number
  average_signal_category: string
  firmware: Firmware
  updated_at: 'string'
  wifi_is_ring_network: boolean
  packet_loss_category: string
  packet_loss_strength: number
}

export type DingKind =
  | 'motion'
  | 'ding'
  | 'on_demand' // Live View
  | 'alarm' // Linked Event - Alarm
  | 'on_demand_link' // Linked Event - Motion

export interface CameraEvent {
  created_at: string
  cv_properties: {
    detection_type: null | any
    person_detected: null | any
    stream_broken: null | any
  }
  ding_id: number
  ding_id_str: string
  doorbot_id: number
  favorite: boolean
  kind: DingKind
  recorded: false
  recording_status: 'ready' | 'audio_ready'
  state: 'timed_out' | 'completed'
}

// timed_out + ding === Missed Ring
// completed === Answered

export interface CameraEventResponse {
  events: CameraEvent[]
  meta: { pagination_key: string }
}

export interface CameraEventOptions {
  limit?: number
  kind?: DingKind
  state?: 'missed' | 'accepted' | 'person_detected'
  favorites?: boolean
  olderThanId?: string // alias for pagination_key
  pagination_key?: string
}

export interface HistoryOptions {
  limit?: number
  offset?: number
  category?: 'alarm' | 'beams'
  maxLevel?: number
}

export interface RingDeviceHistoryEvent {
  msg: 'DataUpdate'
  datatype: MessageDataType
  body: any // Skipping for now
}

export interface ActiveDing {
  id: number
  id_str: string
  state: 'ringing'
  protocol: 'sip'
  doorbot_id: number
  doorbot_description: string
  device_kind: RingCameraKind
  motion: boolean
  snapshot_url: ''
  kind: DingKind
  sip_server_ip: string
  sip_server_port: number
  sip_server_tls: boolean
  sip_session_id: string
  sip_from: string
  sip_to: string
  audio_jitter_buffer_ms: number
  video_jitter_buffer_ms: number
  sip_endpoints: null
  expires_in: number
  now: number
  optimization_level: number
  sip_token: string
  sip_ding_id: string
}

export interface SnapshotTimestamp {
  timestamp: number
  doorbot_id: number
}

export interface AuthTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: 'client'
  token_type: 'Bearer'
}

export interface SessionResponse {
  profile: {
    id: number
    email: string
    first_name: string
    last_name: string
    phone_number: string
    authentication_token: string
    features: { [name: string]: boolean | number | string | string[] }
    hardware_id: string
    explorer_program_terms: null
    user_flow: string
    app_brand: string
    country: string
    status: string
    created_at: string
    tfa_enabled: boolean
    tfa_phone_number: null | string
  }
}

export interface AccountMonitoringStatus {
  accountUuid: string
  externalServiceConfigType: 'rrms' | string
  accountState: 'PROFESSIONAL' | string
  eligibleForDispatch: boolean
  addressComplete: boolean
  contactsComplete: boolean
  codewordComplete: boolean
  alarmSignalSent: boolean
  professionallyMonitored: boolean
  userAcceptDispatch: boolean
  installationDate: number
  externalId: string
  vrRequired: false
  vrUserOptIn: false
  cmsMonitoringType: 'full' | string
  dispatchSetupComplete: boolean
}

export enum DispatchSignalType {
  Burglar = 'user-verified-burglar-xa',
  Fire = 'user-verified-fire-xa',
}

export type LocationModeInput = 'home' | 'away' | 'disarmed'
export type LocationMode = LocationModeInput | 'disabled' | 'unset'
export const disabledLocationModes: LocationMode[] = ['disabled', 'unset']

export interface LocationModeResponse {
  mode: LocationMode
  lastUpdateTimeMS: number
  securityStatus: {
    lu?: number
    md: 'none' | string
    returnTopic: string
  }
  readOnly: boolean
  notYetParticipatingInMode?: []
}

export type LocationModeAction =
  | 'disableMotionDetection'
  | 'enableMotionDetection'
  | 'blockLiveViewLocally'
  | 'allowLiveViewLocally'

export interface LocationModeSetting {
  deviceId: string
  deviceIdType: 'doorbot' | string
  actions: LocationModeAction[]
}

export interface LocationModeSettings {
  disarmed: LocationModeSetting[]
  home: LocationModeSetting[]
  away: LocationModeSetting[]
}

export interface LocationModeSettingsResponse extends LocationModeSettings {
  lastUpdateTimeMS: number
}

export interface LocationModeSharing {
  sharedUsersEnabled: boolean
  lastUpdateTimeMS: number
}
