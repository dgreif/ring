import { RingDeviceCategory, RingDeviceType } from '../../ring-types.ts'

export const BASE_ASSET_UUID = 'asset-base-uuid-0001'
export const BEAM_ASSET_UUID = 'asset-beam-uuid-0001'

export const clapTicketResponse = {
  assets: [
    {
      doorbotId: 3001,
      kind: 'base_station_v1' as const,
      onBattery: false,
      status: 'online' as const,
      uuid: BASE_ASSET_UUID,
    },
    {
      doorbotId: 4001,
      kind: 'beams_bridge_v1' as const,
      onBattery: false,
      status: 'online' as const,
      uuid: BEAM_ASSET_UUID,
    },
  ],
  host: 'mock-hub.example.ring.com',
  subscriptionTopics: [] as string[],
  ticket: 'mock-ticket-token',
}

function nestDevice(
  general: Record<string, unknown>,
  device: Record<string, unknown> = {},
) {
  return {
    general: { v2: general },
    device: { v1: device },
  }
}

export const hubDeviceDocs = {
  securityPanel: nestDevice(
    {
      zid: 'zid-security-panel',
      name: 'Security Panel',
      deviceType: RingDeviceType.SecurityPanel,
      categoryId: RingDeviceCategory.Security,
      batteryStatus: 'none',
      tamperStatus: 'ok',
      tags: [],
      roomId: 1,
    },
    { mode: 'none', faulted: false },
  ),
  baseStation: nestDevice({
    zid: 'zid-base-station',
    name: 'Base Station',
    deviceType: RingDeviceType.BaseStation,
    categoryId: RingDeviceCategory.Security,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    volume: 0.5,
  }),
  contactSensor: nestDevice({
    zid: 'zid-contact',
    name: 'Front Door Contact',
    deviceType: RingDeviceType.ContactSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  motionSensor: nestDevice({
    zid: 'zid-motion',
    name: 'Hall Motion',
    deviceType: RingDeviceType.MotionSensor,
    categoryId: RingDeviceCategory.SensorsMotion,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  floodFreeze: nestDevice({
    zid: 'zid-flood-freeze',
    name: 'Basement Flood/Freeze',
    deviceType: RingDeviceType.FloodFreezeSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    flood: { faulted: false },
    freeze: { faulted: false },
  }),
  smokeAlarm: nestDevice({
    zid: 'zid-smoke',
    name: 'Kitchen Smoke',
    deviceType: RingDeviceType.SmokeAlarm,
    categoryId: RingDeviceCategory.Alarms,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    alarmStatus: 'inactive',
  }),
  coAlarm: nestDevice({
    zid: 'zid-co',
    name: 'Hall CO',
    deviceType: RingDeviceType.CoAlarm,
    categoryId: RingDeviceCategory.Alarms,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    alarmStatus: 'inactive',
  }),
  lock: nestDevice({
    zid: 'zid-lock',
    name: 'Front Lock',
    deviceType: 'lock',
    categoryId: RingDeviceCategory.Locks,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    locked: 'locked',
  }),
  thermostat: nestDevice(
    {
      zid: 'zid-thermostat',
      name: 'Living Thermostat',
      deviceType: RingDeviceType.Thermostat,
      categoryId: RingDeviceCategory.Thermostats,
      batteryStatus: 'none',
      tamperStatus: 'ok',
      tags: [],
    },
    { mode: 'off', setPoint: 21, celsius: 20 },
  ),
  waterValve: nestDevice({
    zid: 'zid-valve',
    name: 'Main Valve',
    deviceType: RingDeviceType.WaterValve,
    categoryId: RingDeviceCategory.WaterValves,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    valveState: 'closed',
  }),
  outlet: nestDevice({
    zid: 'zid-outlet',
    name: 'Lamp Outlet',
    deviceType: RingDeviceType.Switch,
    categoryId: RingDeviceCategory.Outlets,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    on: false,
  }),
  fan: nestDevice({
    zid: 'zid-fan',
    name: 'Ceiling Fan',
    deviceType: RingDeviceType.MultiLevelSwitch,
    categoryId: RingDeviceCategory.Fans,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    on: false,
    level: 0.5,
  }),
  multilevelSwitch: nestDevice({
    zid: 'zid-dimmer',
    name: 'Dimmer',
    deviceType: RingDeviceType.MultiLevelSwitch,
    categoryId: RingDeviceCategory.Lights,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    on: true,
    level: 0.75,
  }),
  keypad: nestDevice({
    zid: 'zid-keypad',
    name: 'Entry Keypad',
    deviceType: RingDeviceType.Keypad,
    categoryId: RingDeviceCategory.Keypads,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    brightness: 0.5,
    volume: 0.5,
  }),
  freezeSensor: nestDevice({
    zid: 'zid-freeze',
    name: 'Garage Freeze',
    deviceType: RingDeviceType.FreezeSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  temperatureSensor: nestDevice({
    zid: 'zid-temp',
    name: 'Attic Temp',
    deviceType: RingDeviceType.TemperatureSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    celsius: 19.5,
  }),
  waterSensor: nestDevice({
    zid: 'zid-water',
    name: 'Laundry Water',
    deviceType: RingDeviceType.WaterSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  tiltSensor: nestDevice({
    zid: 'zid-tilt',
    name: 'Garage Tilt',
    deviceType: RingDeviceType.TiltSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  glassbreakSensor: nestDevice({
    zid: 'zid-glass',
    name: 'Window Glass',
    deviceType: RingDeviceType.GlassbreakSensor,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
  smokeCoListener: nestDevice({
    zid: 'zid-smoke-co',
    name: 'Smoke CO Listener',
    deviceType: RingDeviceType.SmokeCoListener,
    categoryId: RingDeviceCategory.Alarms,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    smoke: { alarmStatus: 'inactive' },
    co: { alarmStatus: 'inactive' },
  }),
  kidde: nestDevice({
    zid: 'zid-kidde',
    name: 'Kidde Detector',
    deviceType: RingDeviceType.KiddeSmokeCoAlarm,
    categoryId: RingDeviceCategory.Alarms,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    components: {
      'alarm.smoke': { alarmStatus: 'inactive' },
      'alarm.co': { alarmStatus: 'inactive' },
    },
  }),
  unknownZWave: nestDevice({
    zid: 'zid-zwave',
    name: 'Unknown ZWave',
    deviceType: RingDeviceType.UnknownZWave,
    categoryId: RingDeviceCategory.Unknown,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    basicValue: 0,
  }),
  retrofitZone: nestDevice({
    zid: 'zid-zone',
    name: 'Retrofit Zone',
    deviceType: RingDeviceType.RetrofitZone,
    categoryId: RingDeviceCategory.Sensors,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    faulted: false,
  }),
}

export const beamDeviceDocs = {
  beamSwitch: nestDevice({
    zid: 'zid-beam-switch',
    name: 'Path Light',
    deviceType: RingDeviceType.BeamsSwitch,
    categoryId: RingDeviceCategory.Lights,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    on: false,
  }),
  beamMultiLevel: nestDevice({
    zid: 'zid-beam-dimmer',
    name: 'Porch Beam',
    deviceType: RingDeviceType.BeamsMultiLevelSwitch,
    categoryId: RingDeviceCategory.Lights,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    on: false,
    level: 0.3,
    motionStatus: 'clear',
    motionSensorEnabled: true,
  }),
  beamGroup: nestDevice({
    zid: 'zid-beam-group',
    name: 'All Outside Lights',
    deviceType: RingDeviceType.BeamsLightGroupSwitch,
    categoryId: RingDeviceCategory.Lights,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    on: false,
    groupId: 'group-1',
  }),
  beamMotion: nestDevice({
    zid: 'zid-beam-motion',
    name: 'Yard Motion',
    deviceType: RingDeviceType.BeamsMotionSensor,
    categoryId: RingDeviceCategory.SensorsMotion,
    batteryStatus: 'ok',
    tamperStatus: 'ok',
    tags: [],
    motionStatus: 'clear',
    motionSensorEnabled: true,
  }),
  beamTransformer: nestDevice({
    zid: 'zid-beam-transformer',
    name: 'Beam Transformer',
    deviceType: RingDeviceType.BeamsTransformerSwitch,
    categoryId: RingDeviceCategory.Lights,
    batteryStatus: 'none',
    tamperStatus: 'ok',
    tags: [],
    on: false,
  }),
}

export function sessionInfoMessage(
  sessions: {
    assetUuid: string
    connectionStatus: 'unknown' | 'cell-backup' | 'online'
    doorbotId: number
    kind: string
    sessionId: number
  }[],
) {
  return {
    channel: 'DataUpdate',
    msg: {
      msg: 'SessionInfo' as const,
      datatype: 'SessionInfoType' as const,
      src: sessions[0]?.assetUuid ?? BASE_ASSET_UUID,
      body: sessions,
    },
  }
}

export function hubDisconnectionMessage(src: string = BASE_ASSET_UUID) {
  return {
    channel: 'message',
    msg: {
      msg: 'DeviceInfoDocGetList' as const,
      datatype: 'HubDisconnectionEventType' as const,
      src,
      body: [],
    },
  }
}

export function deviceListMessage(src: string, body: unknown[]) {
  return {
    channel: 'message',
    msg: {
      msg: 'DeviceInfoDocGetList' as const,
      datatype: 'DeviceInfoDocType' as const,
      src,
      body,
    },
  }
}

export function dataUpdateMessage(src: string, body: unknown[]) {
  return {
    channel: 'DataUpdate',
    msg: {
      msg: 'DeviceInfoDocGetList' as const,
      datatype: 'DeviceInfoDocType' as const,
      src,
      body,
    },
  }
}

export const alarmDeviceList = Object.values(hubDeviceDocs)
export const beamDeviceList = Object.values(beamDeviceDocs)
