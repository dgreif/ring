import { describe, expect, it, vi } from 'vitest'
import { SecurityPanel } from '../security-panel.ts'
import {
  createRingDevice,
  expectSet,
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  pushUpdate,
} from './harness.ts'
import type { AlarmMode } from 'ring-client-api'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'
import type { RingPlatformConfig } from '../config.ts'

const {
  SecuritySystemCurrentState: Current,
  SecuritySystemTargetState: Target,
} = hap.Characteristic

function setup(config: Partial<RingPlatformConfig> = {}, mode = 'none') {
  const location = mockLocation(),
    device = createRingDevice(
      {
        name: 'Security Panel',
        zid: 'zid-panel',
        deviceType: RingDeviceType.SecurityPanel,
        categoryId: RingDeviceCategory.Security,
        mode: mode as AlarmMode,
      },
      location,
    ),
    { platformAccessory } = initAccessory(
      SecurityPanel,
      device,
      'Security Panel',
      'panel-1',
      config as RingPlatformConfig,
    ),
    char = (type: any) =>
      getCharacteristic(platformAccessory, hap.Service.SecuritySystem, type)

  return {
    location,
    device,
    platformAccessory,
    current: char(Current),
    target: char(Target),
  }
}

function sensor(
  zid: string,
  deviceType: RingDeviceType,
  faulted: boolean,
  location = mockLocation(),
) {
  return createRingDevice({ zid, name: zid, deviceType, faulted }, location)
}

describe('SecurityPanel', () => {
  it.each([
    ['none', Current.DISARMED],
    ['some', Current.STAY_ARM],
    ['all', Current.AWAY_ARM],
  ])('mode %s → current/target state %d', (mode, expected) => {
    const { device, current, target } = setup()
    pushUpdate(device, { mode: mode as AlarmMode })
    expect(current.value).toBe(expected)
    expect(target.value).toBe(expected)
  })

  it('arms and disarms with no bypassed sensors', async () => {
    const { location, target } = setup()

    await expectSet(target, Target.STAY_ARM, location.armHome, [])
    await expectSet(target, Target.AWAY_ARM, location.armAway, [])
    await expectSet(target, Target.DISARM, location.disarm)
    expect(location.getDevices).not.toHaveBeenCalled()
  })

  it('only offers NIGHT_ARM when nightModeBypassFor is configured', () => {
    expect(setup().target.props.validValues).toEqual([
      Target.AWAY_ARM,
      Target.STAY_ARM,
      Target.DISARM,
    ])
    expect(
      setup({ nightModeBypassFor: 'none' }).target.props.validValues,
    ).not.toContain(Target.NIGHT_ARM)
    expect(
      setup({ nightModeBypassFor: 'some' }).target.props.validValues,
    ).toContain(Target.NIGHT_ARM)
  })

  it.each([
    ['all', 'armAway', 'all'],
    ['some', 'armHome', 'some'],
  ] as const)(
    'NIGHT_ARM with bypass %s → %s, bypassing only faulted contact sensors',
    async (nightModeBypassFor, armMethod, resultingMode) => {
      const { location, device, current, target } = setup({
        nightModeBypassFor,
      })
      location.getDevices.mockResolvedValue([
        sensor('open-door', RingDeviceType.ContactSensor, true),
        sensor('closed-door', RingDeviceType.ContactSensor, false),
        sensor('motion', RingDeviceType.MotionSensor, true),
      ])

      await expectSet(target, Target.NIGHT_ARM, location[armMethod], [
        'open-door',
      ])

      // Ring reports the underlying mode; HomeKit should still show Night
      pushUpdate(device, { mode: resultingMode })
      expect(target.value).toBe(Target.NIGHT_ARM)
      expect(current.value).toBe(Current.NIGHT_ARM)

      // Mode changed outside of HomeKit, so stop reporting Night
      pushUpdate(device, { mode: 'none' })
      pushUpdate(device, { mode: resultingMode })
      expect(target.value).not.toBe(Target.NIGHT_ARM)
    },
  )

  it('reverts TargetState when arming fails', async () => {
    const { location, target } = setup()
    location.armAway.mockRejectedValueOnce(new Error('hub offline'))

    await target.setValue(Target.AWAY_ARM)
    expect(location.armAway).toHaveBeenCalledWith([])
    await vi.waitFor(() => expect(target.value).toBe(Target.DISARM))
  })

  it('reports ALARM_TRIGGERED, and entry-delay only when alarmOnEntryDelay', () => {
    const plain = setup({}, 'all'),
      withEntryDelay = setup({ alarmOnEntryDelay: true }, 'all')

    for (const { device } of [plain, withEntryDelay]) {
      pushUpdate(device, { alarmInfo: { state: 'entry-delay' } })
    }
    expect(plain.current.value).toBe(Current.AWAY_ARM)
    expect(withEntryDelay.current.value).toBe(Current.ALARM_TRIGGERED)

    pushUpdate(plain.device, { alarmInfo: { state: 'burglar-alarm' } })
    expect(plain.current.value).toBe(Current.ALARM_TRIGGERED)
  })

  it('siren switch sounds/silences the siren unless hidden', async () => {
    const { location, device, platformAccessory } = setup(),
      siren = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
      )

    expect(siren.value).toBe(false)
    pushUpdate(device, { siren: { state: 'on' } })
    expect(siren.value).toBe(true)

    const updateValue = vi.spyOn(siren, 'updateValue')
    pushUpdate(device, { siren: undefined })
    expect(updateValue).toHaveBeenLastCalledWith(false)
    expect(siren.value).toBe(false)

    await expectSet(siren, false, location.silenceSiren)
    await expectSet(siren, true, location.soundSiren)

    expect(
      setup({ hideAlarmSirenSwitch: true }).platformAccessory.getService(
        hap.Service.Switch,
      ),
    ).toBeUndefined()
  })
})
