import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SmokeCoListener } from '../smoke-co-listener.ts'
import { BrightnessOnly } from '../brightness-only.ts'
import { PanicButtons } from '../panic-buttons.ts'
import { LocationModeSwitch } from '../location-mode-switch.ts'
import { UnknownZWaveSwitchSwitch } from '../unknown-zwave-switch.ts'
import { Camera } from '../camera.ts'
import {
  emptyConfig,
  getCharacteristic,
  hap,
  initAccessory,
  mockLocation,
  mockLocationMode,
  mockRingCamera,
  mockRingDevice,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('SmokeCoListener / Kidde', () => {
  it('maps smoke + CO component alarmStatus to HK sensors', () => {
    const device = mockRingDevice({
        name: 'Smoke/CO Listener',
        zid: 'zid-smoke-co',
        deviceType: RingDeviceType.SmokeCoListener,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        manufacturerName: 'Ring',
        smoke: { alarmStatus: 'inactive' },
        co: { alarmStatus: 'inactive' },
      }),
      { platformAccessory } = initAccessory(
        SmokeCoListener,
        device,
        'Smoke/CO Listener',
        'smoke-co-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      ),
      co = getCharacteristic(
        platformAccessory,
        hap.Service.CarbonMonoxideSensor,
        hap.Characteristic.CarbonMonoxideDetected,
      )

    expect(smoke.value).toBe(
      hap.Characteristic.SmokeDetected.SMOKE_NOT_DETECTED,
    )
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL,
    )

    device.updateData({ smoke: { alarmStatus: 'active' } })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)

    // `co.alarmStatus` takes precedence over components['alarm.co']
    device.updateData({
      smoke: { alarmStatus: 'inactive' },
      co: { alarmStatus: 'active' },
    })
    expect(co.value).toBe(
      hap.Characteristic.CarbonMonoxideDetected.CO_LEVELS_ABNORMAL,
    )
  })

  it('Kidde uses components alarm.smoke / alarm.co', () => {
    const device = mockRingDevice({
        name: 'Kidde',
        zid: 'zid-kidde',
        deviceType: RingDeviceType.KiddeSmokeCoAlarm,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        manufacturerName: 'Kidde',
        components: {
          'alarm.smoke': { alarmStatus: 'inactive' },
          'alarm.co': { alarmStatus: 'inactive' },
        },
      }),
      { platformAccessory } = initAccessory(
        SmokeCoListener,
        device,
        'Kidde',
        'kidde-1',
      ),
      smoke = getCharacteristic(
        platformAccessory,
        hap.Service.SmokeSensor,
        hap.Characteristic.SmokeDetected,
      )

    device.updateData({
      components: {
        'alarm.smoke': { alarmStatus: 'active' },
        'alarm.co': { alarmStatus: 'inactive' },
      },
    })
    expect(smoke.value).toBe(hap.Characteristic.SmokeDetected.SMOKE_DETECTED)
  })
})

describe('BrightnessOnly (base station / keypad)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('brightness from Ring → Lightbulb; SET debounces to setInfo', async () => {
    const device = mockRingDevice({
        name: 'Keypad',
        zid: 'zid-keypad',
        deviceType: RingDeviceType.Keypad,
        categoryId: RingDeviceCategory.Keypads,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        brightness: 0.4,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        BrightnessOnly,
        device,
        'Keypad',
        'keypad-1',
      ),
      brightness = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.Brightness,
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )

    expect(brightness.value).toBe(40)
    expect(on.value).toBe(true)

    await brightness.setValue(70)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { brightness: 0.7 } },
    })
  })
})

describe('PanicButtons', () => {
  it('alarmInfo burglar/fire → On; SET triggers location panic APIs', async () => {
    const location = mockLocation(),
      device = mockRingDevice(
        {
          name: 'Security Panel',
          zid: 'zid-panel-panic',
          deviceType: RingDeviceType.SecurityPanel,
          batteryStatus: 'none',
          tamperStatus: 'ok',
          manufacturerName: 'Ring',
          mode: 'none',
        },
        { location },
      ),
      { platformAccessory } = initAccessory(
        PanicButtons,
        device,
        'Panic Buttons',
        'panic-1',
      ),
      burglar = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Burglar',
      ),
      fire = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Fire',
      )

    expect(burglar.value).toBe(false)
    expect(fire.value).toBe(false)

    device.updateData({
      alarmInfo: { state: 'burglar-alarm', faultedDevices: [] },
    })
    expect(burglar.value).toBe(true)

    await fire.setValue(true)
    expect(location.triggerFireAlarm).toHaveBeenCalled()

    await burglar.setValue(false)
    expect(location.setAlarmMode).toHaveBeenCalledWith('none')
  })
})

describe('LocationModeSwitch', () => {
  it('onLocationMode → SecuritySystem state; SET → setLocationMode', async () => {
    vi.useRealTimers()
    const location = mockLocationMode('disarmed'),
      { platformAccessory } = initAccessory(
        LocationModeSwitch as any,
        location,
        'Home Mode',
        'mode-1',
      ),
      current = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemCurrentState,
      ),
      target = getCharacteristic(
        platformAccessory,
        hap.Service.SecuritySystem,
        hap.Characteristic.SecuritySystemTargetState,
      )

    expect(current.value).toBe(
      hap.Characteristic.SecuritySystemCurrentState.DISARMED,
    )

    location.onLocationMode.next('away')
    expect(current.value).toBe(
      hap.Characteristic.SecuritySystemCurrentState.AWAY_ARM,
    )

    await target.setValue(hap.Characteristic.SecuritySystemTargetState.STAY_ARM)
    // SET handler is async after callback(); wait for the location call
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('home'),
    )

    location.setLocationMode.mockClear()
    await target.setValue(hap.Characteristic.SecuritySystemTargetState.DISARM)
    await vi.waitFor(() =>
      expect(location.setLocationMode).toHaveBeenCalledWith('disarmed'),
    )
  })
})

describe('UnknownZWaveSwitch', () => {
  it('basicValue → On; SET → setInfo basicValue 255/0', async () => {
    const device = mockRingDevice({
        name: 'Mystery ZWave',
        zid: 'zid-zwave',
        deviceType: RingDeviceType.UnknownZWave,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        basicValue: 0,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        UnknownZWaveSwitchSwitch,
        device,
        'Mystery ZWave',
        'zwave-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
      )

    expect(on.value).toBe(false)
    device.updateData({ basicValue: 255 })
    expect(on.value).toBe(true)

    await on.setValue(false)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { basicValue: 0 } },
    })
  })
})

describe('Camera accessory (streaming stubbed via real CameraController only)', () => {
  it('light + siren Ring ↔ Homebridge without exercising RTP', async () => {
    const device = mockRingCamera(),
      { platformAccessory } = initAccessory(
        Camera,
        device,
        'Garage Cam',
        'camera-1',
        emptyConfig,
      ),
      light = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      ),
      siren = getCharacteristic(
        platformAccessory,
        hap.Service.Switch,
        hap.Characteristic.On,
        'Siren',
      )

    expect(light.value).toBe(false)
    expect(siren.value).toBe(false)

    device.updateData({ led_status: 'on' })
    expect(light.value).toBe(true)

    device.updateData({ siren_status: { seconds_remaining: 30 } })
    expect(siren.value).toBe(true)

    await light.setValue(false)
    expect(device.setLight).toHaveBeenCalledWith(false)

    await siren.setValue(true)
    expect(device.setSiren).toHaveBeenCalledWith(true)
  })

  it('motion Observable updates MotionDetected when already false→true path skips snapshot wait', async () => {
    const device = mockRingCamera(),
      // canTakeSnapshotWhileRecording true + no uuid → loadSnapshot still called;
      // stub loadSnapshot by constructing then patching cameraSource after init is awkward.
      // Instead assert motion=false initial, then emit true with spy on setLight path only.
      // Use hide-free config and verify motion starts false.
      { platformAccessory, accessory } = initAccessory(
        Camera,
        device,
        'Garage Cam',
        'camera-2',
      ),
      motion = getCharacteristic(
        platformAccessory,
        hap.Service.MotionSensor,
        hap.Characteristic.MotionDetected,
      )
    expect(motion.value).toBe(false)

    // Avoid snapshot load hanging: patch cameraSource.loadSnapshot
    ;(accessory as any).cameraSource.loadSnapshot = vi.fn(() =>
      Promise.resolve(),
    )

    device.onMotionDetected.next(true)
    await vi.waitFor(() => expect(motion.value).toBe(true))
  })
})
