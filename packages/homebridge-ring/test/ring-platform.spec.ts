import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BehaviorSubject } from 'rxjs'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest'
import type { RingDevice } from 'ring-client-api'
import { RingApi, RingDeviceCategory, RingDeviceType } from 'ring-client-api'
import type { API, Logging, PlatformAccessory as HBAccessory } from 'homebridge'
import { RingPlatform } from '../ring-platform.ts'
import {
  createPlatformAccessory,
  createRingDevice,
  hap,
  mockLocation,
  PlatformAccessory,
} from './harness.ts'

const contact = () =>
    createRingDevice({
      zid: 'contact',
      name: 'Front Door',
      deviceType: RingDeviceType.ContactSensor,
    }),
  outlet = () =>
    createRingDevice({
      zid: 'outlet',
      name: 'Lamp',
      deviceType: RingDeviceType.Switch,
      categoryId: RingDeviceCategory.Outlets,
    }),
  panel = () =>
    createRingDevice({
      zid: 'panel',
      name: 'Alarm',
      deviceType: RingDeviceType.SecurityPanel,
    })

function fakeLocation(devices: RingDevice[], { supportsModes = false } = {}) {
  return {
    ...mockLocation(),
    cameras: [],
    chimes: [],
    intercoms: [],
    getDevices: () => Promise.resolve(devices),
    supportsLocationModeSwitching: vi.fn(() => Promise.resolve(supportsModes)),
    onLocationMode: new BehaviorSubject('disarmed'),
    getLocationMode: vi.fn(() => Promise.resolve({ mode: 'disarmed' })),
  }
}

describe('RingPlatform', () => {
  let storagePath: string,
    configPath: string,
    getLocations: MockInstance<RingApi['getLocations']>,
    locations: ReturnType<typeof fakeLocation>[],
    homebridge: EventEmitter & {
      user: { storagePath: () => string; configPath: () => string }
      platformAccessory: typeof PlatformAccessory
      registerPlatformAccessories: ReturnType<typeof vi.fn>
      unregisterPlatformAccessories: ReturnType<typeof vi.fn>
      publishExternalAccessories: ReturnType<typeof vi.fn>
    },
    log: Record<'info' | 'warn' | 'error' | 'debug', ReturnType<typeof vi.fn>>

  beforeEach(() => {
    storagePath = mkdtempSync(join(tmpdir(), 'homebridge-ring-'))
    configPath = join(storagePath, 'config.json')
    writeFileSync(configPath, '{"refreshToken":"old-token"}')

    locations = []
    getLocations = vi
      .spyOn(RingApi.prototype, 'getLocations')
      .mockImplementation(() => Promise.resolve(locations as any))

    homebridge = Object.assign(new EventEmitter(), {
      user: { storagePath: () => storagePath, configPath: () => configPath },
      platformAccessory: PlatformAccessory,
      registerPlatformAccessories: vi.fn(),
      unregisterPlatformAccessories: vi.fn(),
      publishExternalAccessories: vi.fn(),
    })
    log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  })

  afterEach(() => {
    getLocations.mock.contexts.forEach((api) => (api as RingApi).disconnect())
    vi.restoreAllMocks()
    rmSync(storagePath, { recursive: true, force: true })
  })

  function createPlatform(config: Record<string, unknown> = {}) {
    return new RingPlatform(
      log as unknown as Logging,
      { refreshToken: 'old-token', disableLogs: true, ...config } as any,
      homebridge as unknown as API,
    )
  }

  function registeredNames() {
    return homebridge.registerPlatformAccessories.mock.calls.flatMap((call) =>
      (call[2] as HBAccessory[]).map((a) => a.displayName),
    )
  }

  it('warns instead of connecting when no refreshToken is configured', () => {
    createPlatform({ refreshToken: undefined })
    homebridge.emit('didFinishLaunching')

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Plugin is not configured'),
    )
    expect(RingApi.prototype.getLocations).not.toHaveBeenCalled()
  })

  it('connects on didFinishLaunching and registers routed accessories', async () => {
    locations = [
      fakeLocation([
        contact(),
        outlet(),
        createRingDevice({
          zid: 'adapter',
          name: 'Adapter',
          deviceType: RingDeviceType.ZWaveAdapter,
        }),
        createRingDevice({
          zid: 'disabled',
          name: 'Disabled Zone',
          deviceType: RingDeviceType.ContactSensor,
          status: 'disabled',
        }),
      ]),
    ]
    createPlatform()
    homebridge.emit('didFinishLaunching')

    await vi.waitFor(() =>
      expect(homebridge.registerPlatformAccessories).toHaveBeenCalledTimes(1),
    )
    expect(registeredNames()).toEqual(['Front Door', 'Lamp'])

    const [, , [frontDoor, lamp]] =
      homebridge.registerPlatformAccessories.mock.calls[0]
    expect(frontDoor.UUID).toBe(hap.uuid.generate('contact'))
    expect(frontDoor.getService(hap.Service.ContactSensor)).toBeDefined()
    expect(lamp.getService(hap.Service.Outlet)).toBeDefined()
    expect(homebridge.unregisterPlatformAccessories).not.toHaveBeenCalled()
  })

  it('adds Panic Buttons and location mode accessories only when enabled', async () => {
    locations = [fakeLocation([panel()], { supportsModes: true })]
    await createPlatform().connectToApi()
    expect(registeredNames()).toEqual(['Alarm', 'Home Mode'])

    homebridge.registerPlatformAccessories.mockClear()
    locations = [fakeLocation([panel()], { supportsModes: true })]
    await createPlatform({
      showPanicButtons: true,
      locationModePollingSeconds: 0,
    }).connectToApi()
    expect(registeredNames()).toEqual(['Alarm', 'Panic Buttons'])
    expect(locations[0].supportsLocationModeSwitching).not.toHaveBeenCalled()
  })

  it.each([
    [
      { hideDeviceIds: [hap.uuid.generate('contact')] },
      ['Lamp', 'All Lights', 'Path Light'],
    ],
    [{ onlyDeviceTypes: [RingDeviceType.ContactSensor] }, ['Front Door']],
    [
      { onlyDeviceTypes: [] },
      ['Front Door', 'Lamp', 'All Lights', 'Path Light'],
    ],
    [{ hideLightGroups: true }, ['Front Door', 'Lamp', 'Path Light']],
  ])('applies config filter %j', async (config, expected) => {
    locations = [
      fakeLocation([
        contact(),
        outlet(),
        createRingDevice({
          zid: 'group',
          name: 'All Lights',
          deviceType: RingDeviceType.BeamsLightGroupSwitch,
          groupId: 'group-1',
        }),
        createRingDevice({
          zid: 'beam',
          name: 'Path Light',
          deviceType: RingDeviceType.BeamsSwitch,
        }),
      ]),
    ]
    await createPlatform(config).connectToApi()
    expect(registeredNames()).toEqual(expected)
  })

  it('reuses cached accessories, prunes their unused services, and removes stale ones', async () => {
    const platform = createPlatform(),
      cachedContact = createPlatformAccessory('Front Door', 'contact'),
      staleAccessory = createPlatformAccessory('Removed Device', 'removed')
    cachedContact.addService(hap.Service.Lightbulb, 'Leftover')
    platform.configureAccessory(cachedContact)
    platform.configureAccessory(staleAccessory)

    locations = [fakeLocation([contact(), outlet()])]
    await platform.connectToApi()

    expect(registeredNames()).toEqual(['Lamp'])
    expect(cachedContact.getService(hap.Service.ContactSensor)).toBeDefined()
    expect(cachedContact.getService(hap.Service.Lightbulb)).toBeUndefined()
    expect(homebridge.unregisterPlatformAccessories).toHaveBeenCalledWith(
      'homebridge-ring',
      'Ring',
      [staleAccessory],
    )
  })

  it('persists refreshed tokens to the homebridge config', async () => {
    await createPlatform().connectToApi()
    const onRefreshTokenUpdated = (getLocations.mock.contexts[0] as any)
      .restClient.onRefreshTokenUpdated

    // Initial auth with no previous token should not touch the config
    onRefreshTokenUpdated.next({ newRefreshToken: 'first-token' })
    expect(readFileSync(configPath, 'utf8')).toBe(
      '{"refreshToken":"old-token"}',
    )

    onRefreshTokenUpdated.next({
      oldRefreshToken: 'old-token',
      newRefreshToken: 'new-token',
    })
    expect(readFileSync(configPath, 'utf8')).toBe(
      '{"refreshToken":"new-token"}',
    )
  })
})
