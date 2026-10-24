import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { BehaviorSubject, Subject } from 'rxjs'
import hap from '@homebridge/hap-nodejs'
import type { Characteristic, CharacteristicValue } from 'homebridge'
import { Categories } from 'homebridge'
import type { Location, RingDeviceData, RingDeviceType } from 'ring-client-api'
import { RingDevice } from 'ring-client-api'
import { setHap } from '../hap.ts'
import type { RingPlatformConfig } from '../config.ts'
import type { MockInstance } from 'vitest'
import { expect, vi } from 'vitest'

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
    id: 'location-1',
    name: 'Home',
    // Real RingDevice subscribes to these, so updates flow through the same path as the hub websocket
    onDevices: new BehaviorSubject<RingDevice[]>([]),
    onDeviceDataUpdate: new Subject<
      Partial<RingDeviceData> & { zid: string }
    >(),
    sendMessage: vi.fn(() => Promise.resolve(undefined)),
    armAway: vi.fn((_bypassSensorZids?: string[]) =>
      Promise.resolve(undefined),
    ),
    armHome: vi.fn((_bypassSensorZids?: string[]) =>
      Promise.resolve(undefined),
    ),
    disarm: vi.fn(() => Promise.resolve(undefined)),
    soundSiren: vi.fn(() => Promise.resolve(undefined)),
    silenceSiren: vi.fn(() => Promise.resolve(undefined)),
    setLightGroup: vi.fn(() => Promise.resolve(undefined)),
    getDevices: vi.fn(() => Promise.resolve([] as RingDevice[])),
    triggerBurglarAlarm: vi.fn(() => Promise.resolve(undefined)),
    triggerFireAlarm: vi.fn(() => Promise.resolve(undefined)),
    setAlarmMode: vi.fn(() => Promise.resolve(undefined)),
    ...extras,
  }
}

export type MockLocation = ReturnType<typeof mockLocation>

export type RingDeviceFixture = Omit<Partial<RingDeviceData>, 'deviceType'> &
  Pick<RingDeviceData, 'zid' | 'name'> & {
    // string allows non-enum types like `lock` / `lock.zwave`
    deviceType: RingDeviceType | string
  }

export type TestRingDevice = RingDevice & {
  location: MockLocation
  setInfo: MockInstance<RingDevice['setInfo']>
  sendCommand: MockInstance<RingDevice['sendCommand']>
}

/**
 * Builds a real `RingDevice` backed by a mock location. `setInfo` and
 * `sendCommand` are spied but still run, so `location.sendMessage` sees the
 * real hub payload.
 */
export function createRingDevice(
  data: RingDeviceFixture,
  location: MockLocation = mockLocation(),
) {
  const device = new RingDevice(
    {
      categoryId: 0,
      batteryStatus: 'none',
      tamperStatus: 'ok',
      manufacturerName: 'Ring',
      tags: [],
      ...data,
    } as RingDeviceData,
    location as unknown as Location,
    'asset-1',
  )

  vi.spyOn(device, 'setInfo')
  vi.spyOn(device, 'sendCommand')

  return device as TestRingDevice
}

/** Simulates a hub DataUpdate for this device via `location.onDeviceDataUpdate` */
export function pushUpdate(
  device: TestRingDevice,
  patch: Partial<RingDeviceData>,
) {
  device.location.onDeviceDataUpdate.next({ zid: device.zid, ...patch })
}

/** SETs a characteristic, then waits for the async Ring call and asserts its exact args */
export async function expectSet(
  characteristic: Characteristic,
  value: CharacteristicValue,
  spy: MockInstance<(...args: any[]) => any>,
  ...expectedArgs: unknown[]
) {
  await characteristic.setValue(value)
  await vi.waitFor(() => expect(spy).toHaveBeenLastCalledWith(...expectedArgs))
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

export function mockRingCamera(initial: Record<string, unknown> = {}) {
  const onData = new BehaviorSubject({
      id: 1002,
      description: 'Garage Cam',
      kind: 'stickup_cam_mini',
      device_id: 'cam-hw-1',
      led_status: 'off',
      siren_status: { seconds_remaining: 0 },
      battery_life: '87',
      ...initial,
    }),
    onMotionDetected = new BehaviorSubject(false),
    onDoorbellPressed = new Subject<null>(),
    onBatteryLevel = new BehaviorSubject<number | null>(87),
    onInHomeDoorbellStatus = new BehaviorSubject<boolean | undefined>(
      undefined,
    ),
    onNewNotification = new Subject<any>()

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
    model: 'Indoor Cam',
    isDoorbot: false,
    hasLight: true,
    hasSiren: true,
    hasInHomeDoorbell: false,
    hasBattery: true,
    hasLowBattery: false,
    isCharging: false,
    canTakeSnapshotWhileRecording: true,
    latestNotificationSnapshotUuid: undefined as string | undefined,
    onData,
    onMotionDetected,
    onDoorbellPressed,
    onBatteryLevel,
    onInHomeDoorbellStatus,
    onNewNotification,
    updateData(patch: Record<string, unknown>) {
      onData.next({ ...onData.getValue(), ...patch } as any)
    },
    setLight: vi.fn(() => Promise.resolve(true)),
    setSiren: vi.fn(() => Promise.resolve(true)),
    setInHomeDoorbell: vi.fn(() => Promise.resolve(true)),
    requestUpdate: vi.fn(),
  }
}

export function mockLocationMode(initialMode: string = 'disarmed') {
  const onLocationMode = new BehaviorSubject(initialMode)
  return {
    name: 'Home',
    onLocationMode,
    getLocationMode: vi.fn(() =>
      Promise.resolve({ mode: onLocationMode.getValue() }),
    ),
    setLocationMode: vi.fn((mode: string) => {
      onLocationMode.next(mode)
      return Promise.resolve({ mode })
    }),
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
