type Firmware = string | 'Up To Date'

// eslint-disable-next-line no-shadow
export enum RingDeviceType {
  BaseStation = 'hub.redsky',
  BaseStationPro = 'hub.kili',
  Keypad = 'security-keypad',
  SecurityPanel = 'security-panel',
  ContactSensor = 'sensor.contact',
  MotionSensor = 'sensor.motion',
  FloodFreezeSensor = 'sensor.flood-freeze',
  FreezeSensor = 'sensor.freeze',
  TemperatureSensor = 'sensor.temperature',
  WaterSensor = 'sensor.water',
  TiltSensor = 'sensor.tilt',
  GlassbreakSensor = 'sensor.glassbreak',
  RangeExtender = 'range-extender.zwave',
  ZigbeeAdapter = 'adapter.zigbee',
  AccessCodeVault = 'access-code.vault',
  AccessCode = 'access-code',
  SmokeAlarm = 'alarm.smoke',
  CoAlarm = 'alarm.co',
  SmokeCoListener = 'listener.smoke-co',
  MultiLevelSwitch = 'switch.multilevel',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  Fan = 'switch.multilevel',
  MultiLevelBulb = 'switch.multilevel.bulb',
  Switch = 'switch',
  BeamsMotionSensor = 'motion-sensor.beams',
  BeamsSwitch = 'switch.beams',
  BeamsMultiLevelSwitch = 'switch.multilevel.beams',
  BeamsLightGroupSwitch = 'group.light-group.beams',
  BeamsTransformerSwitch = 'switch.transformer.beams',
  BeamsDevice = 'device.beams',
  RetrofitBridge = 'bridge.flatline',
  RetrofitZone = 'sensor.zone',
  Thermostat = 'temperature-control.thermostat',
  Sensor = 'sensor',
  RingNetAdapter = 'adapter.ringnet',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  CodeVault = 'access-code.vault',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  SecurityAccessCode = 'access-code',
  ZWaveAdapter = 'adapter.zwave',
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ZWaveExtender = 'range-extender.zwave',
  PanicButton = 'security-panic',
  UnknownZWave = 'unknown.zwave',
  OnvifCamera = 'onvif_camera',
  ThirdPartyGarageDoorOpener = 'third_party_gdo',
  IntercomHandsetAudio = 'intercom_handset_audio',
}

// eslint-disable-next-line no-shadow
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

// eslint-disable-next-line no-shadow
export enum RingCameraKind {
  doorbot = 'doorbot',
  doorbell = 'doorbell',
  doorbell_v3 = 'doorbell_v3',
  doorbell_v4 = 'doorbell_v4',
  doorbell_v5 = 'doorbell_v5',
  doorbell_oyster = 'doorbell_oyster', // used for the Ring Video Doorbell 4
  doorbell_portal = 'doorbell_portal',
  doorbell_scallop = 'doorbell_scallop',
  doorbell_scallop_lite = 'doorbell_scallop_lite',
  doorbell_graham_cracker = 'doorbell_graham_cracker',
  lpd_v1 = 'lpd_v1',
  lpd_v2 = 'lpd_v2',
  lpd_v4 = 'lpd_v4',
  jbox_v1 = 'jbox_v1',
  stickup_cam = 'stickup_cam',
  stickup_cam_v3 = 'stickup_cam_v3',
  stickup_cam_elite = 'stickup_cam_elite',
  stickup_cam_longfin = 'stickup_cam_longfin',
  stickup_cam_lunar = 'stickup_cam_lunar',
  spotlightw_v2 = 'spotlightw_v2',
  hp_cam_v1 = 'hp_cam_v1',
  hp_cam_v2 = 'hp_cam_v2',
  stickup_cam_v4 = 'stickup_cam_v4',
  floodlight_v1 = 'floodlight_v1',
  floodlight_v2 = 'floodlight_v2',
  floodlight_pro = 'floodlight_pro',
  cocoa_camera = 'cocoa_camera', // appears to be used for all next gen stickup cams (wired/battery/solar)
  cocoa_doorbell = 'cocoa_doorbell',
  cocoa_floodlight = 'cocoa_floodlight',
  cocoa_spotlight = 'cocoa_spotlight', // used for the Spotlight Cam Plus (potentially other Spotlight models)
  stickup_cam_mini = 'stickup_cam_mini',
  onvif_camera = 'onvif_camera',
}

export const RingCameraModel: { readonly [P in RingCameraKind]: string } = {
  doorbot: 'Doorbell',
  doorbell: 'Doorbell',
  doorbell_v3: 'Doorbell',
  doorbell_v4: 'Doorbell 2',
  doorbell_v5: 'Doorbell 2',
  doorbell_oyster: 'Doorbell 4',
  doorbell_portal: 'Door View Cam',
  doorbell_scallop: 'Doorbell 3 Plus',
  doorbell_scallop_lite: 'Doorbell 3',
  doorbell_graham_cracker: 'Doorbell Wired',
  lpd_v1: 'Doorbell Pro',
  lpd_v2: 'Doorbell Pro',
  lpd_v4: 'Doorbell Pro 2',
  jbox_v1: 'Doorbell Elite',
  stickup_cam: 'Stick Up Cam',
  stickup_cam_v3: 'Stick Up Cam',
  stickup_cam_elite: 'Stick Up Cam',
  stickup_cam_longfin: 'Spotlight Cam Pro',
  stickup_cam_lunar: 'Stick Up Cam',
  spotlightw_v2: 'Spotlight Cam',
  hp_cam_v1: 'Floodlight Cam',
  hp_cam_v2: 'Spotlight Cam',
  stickup_cam_v4: 'Spotlight Cam',
  floodlight_v1: 'Floodlight Cam',
  floodlight_v2: 'Floodlight Cam',
  floodlight_pro: 'Floodlight Pro',
  cocoa_camera: 'Stick Up Cam',
  cocoa_doorbell: 'Doorbell Gen 2',
  cocoa_floodlight: 'Floodlight Cam Plus',
  cocoa_spotlight: 'Spotlight Cam Plus',
  stickup_cam_mini: 'Indoor Cam',
  onvif_camera: 'ONVIF Camera',
}

export type AlarmMode = 'all' | 'some' | 'none'
export type ThermostatMode = 'heat' | 'cool' | 'off' | 'aux'
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

export type AssetKind =
  | 'base_station_v1'
  | 'beams_bridge_v1'
  | 'floodlight_v2'
  | string

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
  mode?: AlarmMode | ThermostatMode
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
  // temperature-control.thermostat
  // Related: 'mode?: ThermostatMode' (above)
  setPoint?: number
  setPointMax?: number
  setPointMin?: number
  basicValue?: number // unknown.zwave - 0 for off, 255 for on
  componentDevices?: {
    rel: string
    zid: string
  }[]
  // switch.multilevel.beam
  motionSensorEnabled?: boolean
  // security-keypad
  brightness?: number // 0 - 1
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

export type ChimeKind = 'chime' | 'chime_pro' | 'chime_v2' | 'chime_pro_v2'
export const ChimeModel: { readonly [P in ChimeKind]: string } = {
  chime: 'Chime',
  chime_pro: 'Chime Pro',
  chime_v2: 'Chime v2',
  chime_pro_v2: 'Chime Pro v2',
}

export interface ChimeData {
  id: number
  description: string
  device_id: string
  time_zone: string
  firmware_version: Firmware
  kind: ChimeKind
  latitude: number
  longitude: number
  address: string
  settings: {
    volume: number
    ding_audio_user_id: string
    ding_audio_id: string
    motion_audio_user_id: string
    motion_audio_id: string
  }
  features: {
    ringtones_enabled: boolean
  }
  owned: boolean
  alerts: {
    connection: string
    rssi: string
  }
  do_not_disturb: {
    seconds_left: number
  }
  stolen: boolean
  location_id: string
  ring_id: null
  owner: {
    id: number
    first_name: string
    last_name: string
    email: string
  }
}

export type ChimeSoundKind = 'motion' | 'ding'

export interface ChimeUpdate {
  description?: string
  latitude?: number
  longitude?: number
  address?: string
  settings?: {
    volume?: number
    ding_audio_user_id?: string
    ding_audio_id?: string
    motion_audio_user_id?: string
    motion_audio_id?: string
  }
}

export interface RingtoneOptions {
  default_ding_user_id: string
  default_ding_id: string
  default_motion_user_id: string
  default_motion_id: string
  audios: [
    {
      user_id: string
      id: string
      description: string
      kind: string
      url: string
      checksum: string
      available: string
    },
  ]
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

// eslint-disable-next-line no-shadow
export enum DoorbellType {
  Mechanical = 0,
  Digital = 1,
  None = 2,
}

export interface BaseCameraData {
  alerts: {
    connection: 'online' | 'offline' | string
    battery?: 'low' | string
    ota_status?: 'timeout' | string
  }
  created_at: string
  deactivated_at: null | string
  description: string
  device_id: string
  features: {
    motions_enabled: boolean
    show_recordings: boolean
    advanced_motion_enabled: boolean
    people_only_enabled: boolean
    shadow_correction_enabled: boolean
    motion_message_enabled: boolean
    night_vision_enabled: boolean
  }
  id: number
  is_sidewalk_gateway: boolean
  location_id: string
  motion_snooze: null | { scheduled: boolean }
  night_mode_status: 'unknown' | 'true' | 'false'
  owned: boolean
  ring_net_id: null

  settings: {
    enable_vod: boolean | 1
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
    floodlight_settings?: {
      priority: number
      duration: number
      brightness?: number
      always_on: boolean
      always_on_duration: null | number
    }
    light_schedule_settings?: any
    luma_light_threshold?: number
    live_view_disabled?: boolean // set by modes
    motion_detection_enabled?: boolean // set by modes or Record Motion toggle
    power_mode?: 'battery' | 'wired' // some battery cams can be wired and set to operate in "wired" mode
    sheila_settings: {
      cv_processing_enabled: boolean | null
      local_storage_enabled: boolean | null // true for Ring Edge devices
    }
    server_settings: {
      ring_media_server_enabled: boolean
    }
  }
  subscribed: boolean
  subscribed_motions: boolean
  time_zone: string
  motion_detection_enabled?: boolean
  camera_location_indoor?: boolean
  facing_window?: boolean
  enable_ir_led?: boolean
  owner: {
    id: number
    email: string
    first_name: string
    last_name: string
  }
  led_status?: 'on' | 'off'
  ring_cam_light_installed?: 'true' | 'false'
  ring_cam_setup_flow?: 'floodlight'
  siren_status?: {
    started_at?: string
    duration?: string
    ends_at?: string
    seconds_remaining: number
  }
  health: {
    device_type: RingCameraKind
    last_update_time: number
    connected: boolean
    rss_connected: boolean
    vod_enabled: boolean
    sidewalk_connection: boolean
    floodlight_on: boolean
    siren_on?: boolean
    white_led_on: boolean
    night_mode_on: boolean
    hatch_open: boolean
    packet_loss: number
    packet_loss_category: 'good' | string
    rssi: number
    battery_voltage: number
    wifi_is_ring_network: boolean
    supported_rpc_commands: string[]
    ota_status: 'successful' | string
    ext_power_state?: 0 | number
    pref_run_mode?: 'low_power' | string
    run_mode?: 'low_power' | 'full_power' | string
    network_connection_value: 'wifi' | string
    ac_power: number // 0 if not on ac power, 1 if ac power
    battery_present?: boolean
    external_connection: boolean
    battery_percentage?: number // 0 - 100
    battery_percentage_category: 'very_good' | 'unknown' | string
    firmware_version: string // 'cam-1.12.13000'
    rssi_category: 'good' | string
    battery_voltage_category: 'very_good' | string
    second_battery_voltage_category: 'unknown' | string
    second_battery_percentage?: number // 0 - 100
    second_battery_percentage_category: 'unknown' | string
    battery_save: boolean
    firmware_version_status: 'Up to Date'
    tx_rate: number
    ptz_connected?: 'penguin'
  }
}

export interface CameraData extends BaseCameraData {
  kind: Omit<RingCameraKind, RingCameraKind.onvif_camera>

  address: string
  battery_life: number | string | null // 4003 or 100 or "100" or "71"
  battery_life_2?: number | string | null
  battery_voltage?: number
  battery_voltage_2?: number
  external_connection: boolean
  firmware_version: Firmware
  latitude: number
  longitude: number
  ring_id: null
  stolen: boolean
}

export interface OnvifCameraData extends BaseCameraData {
  kind: RingCameraKind.onvif_camera

  metadata: {
    legacy_fw_migrated: boolean
    imported_from_amazon: boolean
    is_sidewalk_gateway: boolean
    third_party_manufacturer: string
    third_party_model: string
    third_party_dsn: string
    third_party_properties: {
      amzn_dsn: string
      uuid: string
    }
  }
  owner_id: number
  updated_at: string
}

export interface ThirdPartyGarageDoorOpener {
  id: number
  kind: RingDeviceType.ThirdPartyGarageDoorOpener
  description: string
  location_id: string
  owner_id: number
  hardware_id: string
  created_at: string
  updated_at: string
  role: 'owner' | string
  metadata: {
    is_sidewalk_gateway: boolean
    third_party_manufacturer: string
    third_party_model: string
    third_party_properties: {
      key_access_point_associated: 'true' | 'false'
    }
    integration_type: 'Key by Amazon' | string
  }
  ring_net_id: null
  is_sidewalk_gateway: boolean
}

export interface IntercomHandsetAudioData {
  id: number
  description: string
  device_id: string
  kind: RingDeviceType.IntercomHandsetAudio
  function: {
    name: null
  }
  settings: {
    show_recordings: boolean
    recording_ttl: number
    recording_enabled: boolean
    keep_alive: null
    chime_settings: {
      type: number
      enable: boolean
      duration: number
    }
    intercom_settings: {
      predecessor: string
      config: string
      ring_to_open: boolean
      intercom_type: 'DF' | string
      unlock_mode: number
      replication: number
    }
    keep_alive_auto: number
    doorbell_volume: number
    enable_chime: number
    theft_alarm_enable: number
    use_cached_domain: number
    use_server_ip: number
    server_domain: 'fw.ring.com' | string
    server_ip: null
    enable_log: number
    forced_keep_alive: null
    mic_volume: number
    voice_volume: number
  }
  features: {
    motion_zone_recommendation: boolean
    motions_enabled: boolean
    show_recordings: boolean
    show_vod_settings: boolean
    rich_notifications_eligible: boolean
    show_24x7_lite: boolean
    show_offline_motion_events: boolean
    cfes_eligible: boolean
    sheila_camera_eligible: null | boolean
    sheila_camera_processing_eligible: null | boolean
    chime_auto_detect_capable: boolean
  }
  owned: boolean
  owner: {
    id: number
    first_name: string
    last_name: string
    email: string
  }
  alerts: {
    connection: 'online' | 'offline' | string
    ota_status?: 'no_ota' | string
  }
  firmware_version: 'Up to Date' | string
  location_id: string
  time_zone: string
  created_at: string
  ring_net_id: null
  is_sidewalk_gateway: boolean
  subscribed: boolean
  deactivated_at: null | string
  battery_life: string
  metadata: {
    ethernet: boolean
    legacy_fw_migrated: boolean
    imported_from_amazon: boolean
    is_sidewalk_gateway: boolean
    key_access_point_associated: boolean
  }
}

export interface UnknownDevice {
  id: number
  kind: unknown
  description: string
}

export interface CvDetectionType {
  enabled: boolean
  mode: string
  notification: boolean
}

export interface DayNightConfig {
  day: number
  night: number
}

// These types may not be complete/accurate. PRs welcome.
export interface CameraDeviceSettingsData {
  advanced_motion_settings: {
    active_motion_filter: number
    advanced_object_settings: {
      human_detection_confidence: DayNightConfig
      motion_zone_overlap: DayNightConfig
      object_size_maximum: DayNightConfig
      object_size_minimum: DayNightConfig
      object_time_overlap: DayNightConfig
    }
  }
  chime_settings: {
    duration: number
    enable: boolean
    enable_ext: boolean
    type: number
  }
  motion_settings: {
    enable_audio: boolean
    motion_detection_enabled: boolean
    enable_ir_led: boolean
    advanced_motion_detection_enabled: boolean
    advanced_motion_detection_mode: string
    advanced_motion_detection_human_only_mode: boolean
    advanced_motion_detection_loitering_mode: boolean
    motion_snooze_privacy_timeout: number
    advanced_motion_zones_enabled: boolean
    advanced_motion_zones_type: string
    enable_indoor_mode: boolean
    enable_pir_validation: boolean
    loitering_threshold: number
    enable_rlmd: boolean
    enable_recording: boolean
    end_detection: number
    advanced_motion_recording_human_mode: boolean
    advanced_motion_glance_enabled: boolean
  }
  video_settings: {
    exposure_control: number
    night_color_enable: boolean
    hdr_enable: boolean
    clip_length_max: number
    clip_length_min: number
    ae_mode: number
    ae_mask: string
  }
  vod_settings: {
    enable: boolean
    toggled_at: string // date,
    use_cached_vod_domain: boolean
  }
  volume_settings: {
    doorbell_volume: number
    mic_volume: number
    voice_volume: number
  }
  cv_settings: {
    detection_types: {
      human: CvDetectionType
      loitering: CvDetectionType
      motion: CvDetectionType
      moving_vehicle: CvDetectionType
      nearby_pom: CvDetectionType
      other_motion: CvDetectionType
      package_delivery: CvDetectionType
      package_pickup: CvDetectionType
    }
    threshold: {
      loitering: number
      package_delivery: number
    }
  }
  general_settings: {
    enable_audio_recording: boolean
    lite_24x7_enabled: boolean
    offline_motion_event_enabled: boolean
    lite_24x7_subscribed: boolean
    offline_motion_event_subscribed: boolean
    firmwares_locked: boolean
    utc_offset: string
    theft_alarm_enable: boolean
    use_wrapup_domain: boolean
    power_mode: 'battery' | 'wired'
    data_collection_enabled: boolean
  }
  keep_alive_settings: {
    keep_alive_auto: number
  }
  pir_settings: {
    sensitivity_1: number
    sensitivity_2: number
    sensitivity_3: number
    zone_enable: number
  }
  snapshot_settings: {
    frequency_secs: number
    lite_24x7_resolution_p: number
    ome_resolution_p: number
    max_upload_kb: number
    frequency_after_secs: number
    period_after_secs: number
    close_container: number
  }
  client_device_settings: {
    ringtones_enabled: boolean
    people_only_enabled: boolean
    advanced_motion_enabled: boolean
    motion_message_enabled: boolean
    shadow_correction_enabled: boolean
    night_vision_enabled: boolean
    light_schedule_enabled: boolean
    rich_notifications_eligible: boolean
    show_24x7_lite: boolean
    show_offline_motion_events: boolean
    cfes_eligible: boolean
    show_radar_data: boolean
    motion_zone_recommendation: boolean
  }
  concierge_settings?: {
    alexa_settings?: {
      delay_ms: number
    }
    autoreply_settings?: {
      delay_ms: number
    }
    mode?: string
  }
}

type HealthCategory =
  | 'very_poor'
  | 'poor'
  | 'good'
  | 'very_good'
  | 'unknown'
  | 'NA'
  | string
  | null

export interface ChimeHealth {
  id: number
  wifi_name: string
  battery_percentage: HealthCategory
  battery_percentage_category: HealthCategory
  battery_voltage: number | null
  battery_voltage_category: HealthCategory
  latest_signal_strength: number
  latest_signal_category: HealthCategory
  average_signal_strength: number
  average_signal_category: HealthCategory
  firmware: Firmware
  updated_at: 'string'
  wifi_is_ring_network: boolean
  packet_loss_category: HealthCategory
  packet_loss_strength: number
}

export interface CameraHealth extends ChimeHealth {
  transformer_voltage?: number
  transformer_voltage_category?: 'good'
  ext_power_state?: number
}

export type DingKind =
  | 'motion'
  | 'ding'
  | 'on_demand' // Live View
  | 'alarm' // Linked Event - Alarm
  | 'on_demand_link' // Linked Event - Motion
  | 'door_activity' // knock
  | 'key_access'
  | 'DELETED_FOOTAGE'
  | 'OFFLINE_FOOTAGE'
  | 'OFFLINE_MOTION'

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

export interface VideoSearchResult {
  ding_id: string
  created_at: number
  hq_url: null | string
  lq_url: string
  preroll_duration: null | unknown
  thumbnail_url: string
  untranscoded_url: string
  kind: DingKind
  state: 'timed_out' | 'completed'
  had_subscription: boolean
  favorite: boolean
  duration: number
  cv_properties: {
    person_detected: null | unknown
    stream_broken: null | unknown
    detection_type: null | unknown
  }
}

export interface VideoSearchResponse {
  video_search: VideoSearchResult[]
}

export interface PeriodicalFootage {
  start_ms: number
  end_ms: number
  playback_ms: number
  kind: 'online_periodical' | 'offline_periodical'
  url: string
  deleted: boolean
  snapshots: number[]
}

export interface PeriodicFootageResponse {
  meta: {
    pagination_key: number
    butch_size: number
  }
  data: PeriodicalFootage[]
  responseTimestamp: number
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

export type DingState = 'ringing' | 'connected' | 'timed_out' | 'completed'

// eslint-disable-next-line no-shadow
export enum NotificationDetectionType {
  // Note, this list may not be complete
  Human = 'human',
  Loitering = 'loitering',
  Motion = 'motion',
  OtherMotion = 'other_motion',
  NotAvailable = 'null',
  StreamBroken = 'stream_broken',
}

// eslint-disable-next-line no-shadow
export enum PushNotificationAction {
  Ding = 'com.ring.pn.live-event.ding',
  Motion = 'com.ring.pn.live-event.motion',
  IntercomUnlock = 'com.ring.pn.intercom.virtual.unlock',
  AlarmModeNone = 'com.ring.push.HANDLE_NEW_SECURITY_PANEL_MODE_NONE_NOTICE',
  AlarmModeSome = 'com.ring.push.HANDLE_NEW_SECURITY_PANEL_MODE_SOME_NOTICE',
  AlarmSoundSiren = 'com.ring.push.HANDLE_NEW_USER_SOUND_SIREN',
  AlarmSilenceSiren = 'com.ring.push.HANDLE_NEW_NON_ALARM_SIREN_SILENCED',
}

export interface PushNotificationDingV2 {
  version: '2.0.0' | string
  android_config: {
    category: PushNotificationAction | string
    body: string
  }
  analytics: {
    server_correlation_id: string
    server_id: 'com.ring.pns' | string
    subcategory: string
    triggered_at: number
    sent_at: number
    referring_item_type: string
    referring_item_id: string
  }
  data: {
    device: {
      e2ee_enabled: boolean
      id: number
      kind: RingCameraKind
      name: string
    }
    event: {
      ding: {
        id: string
        created_at: string
        subtype: 'other_motion' | 'motion' | 'ding' | 'human' | string
        detection_type: NotificationDetectionType
      }
      eventito: {
        type: NotificationDetectionType
        timestamp: number
      }
      riid: string
      is_sidewalk: boolean
      live_session: {
        streaming_data_hash: string
        active_streaming_profile: 'rms' | string
        default_audio_route: string
        max_duration: number
      }
    }
    location: {
      id: string
    }
  }
  img?: {
    snapshot_uuid: string
  }
}

export interface PushNotificationAlarm {
  aps: {
    alert: string
  }
  action: PushNotificationAction | string
  alarm_meta: {
    device_zid: number
    location_id: string
  }
}

export interface PushNotificationAlarmV2 {
  data: {
    gcmData: PushNotificationAlarm
  }
}

export type PushNotification = PushNotificationDingV2 | PushNotificationAlarmV2

export interface SocketTicketResponse {
  ticket: string
  responseTimestampe: number
}

export interface AuthTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  scope: 'client'
  token_type: 'Bearer'
}

export type TwoStageVerificationState = 'sms' | 'email' | 'totp' // totp is "time-based OTP"
export type Auth2faResponse =
  | {
      error?: string | unknown
      error_description?: string
    }
  | {
      next_time_in_secs: number
      phone: string
      tsv_state: TwoStageVerificationState
    }

export interface ProfileResponse {
  profile: {
    id: number
    email: string
    first_name: string
    last_name: string
    phone_number: string
    authentication_token: string
    features: { [name: string]: boolean | number | string | string[] }
    user_preferences: {
      settings: any
      preferences: any
    }
    hardware_id: string
    explorer_program_terms: null
    user_flow: 'ring' | string
    app_brand: string
    country: string
    status: 'legacy' | string
    created_at: string
    tfa_enabled: boolean
    tfa_phone_number: null | string
    account_type: 'ring' | string
  }
}
export interface SessionResponse extends ProfileResponse {}

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

// eslint-disable-next-line no-shadow
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
  notYetParticipatingInMode?: {
    deviceId: number
    deviceIdType: 'doorbot' | string
  }[]
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

export function isWebSocketSupportedAsset({ kind }: { kind: AssetKind }) {
  return kind.startsWith('base_station') || kind.startsWith('beams_bridge')
}
