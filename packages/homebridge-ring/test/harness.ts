import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { BehaviorSubject, Subject } from 'rxjs'
import hap from '@homebridge/hap-nodejs'
import { Categories } from 'homebridge'
import { setHap } from '../hap.ts'
import type { RingPlatformConfig } from '../config.ts'
import { vi } from 'vitest'

setHap(hap)

// Homebridge 2.4 type-only-exports PlatformAccessory; load the runtime class by path.
const require = createRequire(import.meta.url),
  homebridgeEntry = require.resolve('homebridge'),
  platformAccessoryPath = path.join(
    path.dirname(homebridgeEntry),
    'platformAccessory.js',
  ),
  { PlatformAccessory } = await import(
    pathToFileURL(platformAccessoryPath).href
  )

export { hap, PlatformAccessory }

export function createPlatformAccessory(
  name: string,
  id: string,
  category: Categories = Categories.OTHER,
) {
  return new PlatformAccessory(name, hap.uuid.generate(id), category)
}

export function mockLocation(extras: Record<string, unknown> = {}) {
  return {
    name: 'Home',
    sendMessage: vi.fn(() => Promise.resolve(undefined)),
    armAway: vi.fn(() => Promise.resolve(undefined)),
    armHome: vi.fn(() => Promise.resolve(undefined)),
    disarm: vi.fn(() => Promise.resolve(undefined)),
    soundSiren: vi.fn(() => Promise.resolve(undefined)),
    silenceSiren: vi.fn(() => Promise.resolve(undefined)),
    setLightGroup: vi.fn(() => Promise.resolve(undefined)),
    getDevices: vi.fn(() => Promise.resolve([])),
    triggerBurglarAlarm: vi.fn(() => Promise.resolve(undefined)),
    triggerFireAlarm: vi.fn(() => Promise.resolve(undefined)),
    setAlarmMode: vi.fn(() => Promise.resolve(undefined)),
    ...extras,
  }
}

export function mockRingDevice(
  initial: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  const onData = new BehaviorSubject({ ...initial }),
    { location: locationExtra, ...restExtras } = extras,
    location =
      (locationExtra as ReturnType<typeof mockLocation>) ?? mockLocation()

  return {
    name: (initial.name as string) ?? 'Device',
    id: (initial.zid as string) ?? 'zid',
    zid: (initial.zid as string) ?? 'zid',
    deviceType: initial.deviceType,
    categoryId: initial.categoryId,
    get data() {
      return onData.getValue()
    },
    onData,
    onComponentDevices: new BehaviorSubject([] as any[]),
    updateData(patch: Record<string, unknown>) {
      onData.next({ ...onData.getValue(), ...patch })
    },
    setInfo: vi.fn(() => Promise.resolve(undefined)),
    sendCommand: vi.fn(),
    setVolume: vi.fn(() => Promise.resolve(undefined)),
    location,
    ...restExtras,
  }
}

export function mockRingChime(initial: Record<string, unknown> = {}) {
  const onData = new BehaviorSubject({
    id: 2001,
    description: 'Hall Chime',
    kind: 'chime_pro_v2',
    settings: {
      volume: 6,
      ding_audio_user_id: '0',
      ding_audio_id: '0',
      motion_audio_user_id: '0',
      motion_audio_id: '0',
      night_light_settings: { light_sensor_enabled: false },
    },
    do_not_disturb: { seconds_left: 0 },
    ...initial,
  })

  return {
    get name() {
      return onData.getValue().description
    },
    get id() {
      return onData.getValue().id
    },
    get data() {
      return onData.getValue()
    },
    onData,
    updateData(patch: Record<string, unknown>) {
      onData.next({ ...onData.getValue(), ...patch } as any)
    },
    requestUpdate: vi.fn(),
    snooze: vi.fn(() => Promise.resolve(undefined)),
    clearSnooze: vi.fn(() => Promise.resolve(undefined)),
    setVolume: vi.fn(() => Promise.resolve(undefined)),
    setNightMode: vi.fn(() => Promise.resolve(undefined)),
    setNightlightEnabled: vi.fn(() => Promise.resolve(undefined)),
    playSound: vi.fn(() => Promise.resolve(undefined)),
  }
}

export function mockRingIntercom(initial: Record<string, unknown> = {}) {
  const onData = new BehaviorSubject({
      id: 5001,
      description: 'Lobby Intercom',
      kind: 'intercom_handset_audio',
      battery_life: '100',
      device_id: 'ic-hw-1',
      ...initial,
    }),
    onDing = new Subject<null>(),
    onUnlocked = new Subject<null>(),
    onBatteryLevel = new BehaviorSubject<number | null>(100)

  return {
    get name() {
      return onData.getValue().description
    },
    get id() {
      return onData.getValue().id
    },
    get data() {
      return onData.getValue()
    },
    batteryLevel: null as number | null,
    onData,
    onDing,
    onUnlocked,
    onBatteryLevel,
    updateData(patch: Record<string, unknown>) {
      onData.next({ ...onData.getValue(), ...patch } as any)
    },
    requestUpdate: vi.fn(),
    unlock: vi.fn(() => Promise.resolve(undefined)),
  }
}

export function getCharacteristic(
  accessory: InstanceType<typeof PlatformAccessory>,
  ServiceType: any,
  CharacteristicType: any,
  subType?: string,
) {
  const service = subType
    ? accessory.getServiceById(ServiceType, subType)
    : accessory.getService(ServiceType)
  if (!service) {
    throw new Error(
      `Service not found: ${ServiceType?.name ?? ServiceType}${
        subType ? `/${subType}` : ''
      }`,
    )
  }
  return service.getCharacteristic(CharacteristicType)
}

export const emptyConfig = {} as RingPlatformConfig

export function initAccessory<T extends { initBase: () => void }>(
  AccessoryClass: new (...args: any[]) => T,
  device: unknown,
  name: string,
  id: string,
  config: RingPlatformConfig = emptyConfig,
) {
  const platformAccessory = createPlatformAccessory(name, id),
    accessory = new AccessoryClass(device, platformAccessory, config)
  accessory.initBase()
  return { accessory, platformAccessory, device }
}
