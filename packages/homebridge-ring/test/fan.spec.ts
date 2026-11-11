import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Fan } from '../fan.ts'
import * as util from 'ring-client-api/util'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  expectSet,
  pushUpdate,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Fan', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('On + RotationSpeed (debounced) → setInfo', async () => {
    const device = createRingDevice({
        name: 'Ceiling Fan',
        zid: 'zid-fan',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Fans,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        level: 0.5,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Fan,
        device,
        'Ceiling Fan',
        'fan-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.On,
      ),
      speed = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.RotationSpeed,
      )

    expect(speed.value).toBe(50)
    await expectSet(on, true, device.setInfo, {
      device: { v1: { on: true } },
    })

    device.setInfo.mockClear()
    await speed.setValue(80)
    expect(device.setInfo).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenCalledWith({
      device: { v1: { level: 0.8 } },
    })
  })

  it('restores a rejected speed write without a GET handler or Ring update', async () => {
    const error = new Error('Ring API down'),
      logError = vi.spyOn(util, 'logError').mockImplementation(() => {}),
      device = createRingDevice({
        name: 'Ceiling Fan',
        zid: 'zid-fan',
        deviceType: RingDeviceType.MultiLevelSwitch,
        categoryId: RingDeviceCategory.Fans,
        level: 0.5,
      }),
      { platformAccessory } = initAccessory(
        Fan,
        device,
        'Ceiling Fan',
        'fan-failure',
      ),
      speed = getCharacteristic(
        platformAccessory,
        hap.Service.Fan,
        hap.Characteristic.RotationSpeed,
      )

    device.setInfo.mockRejectedValueOnce(error)
    await speed.setValue(80)
    await vi.advanceTimersByTimeAsync(500)

    expect(logError).toHaveBeenCalledWith(error)
    expect(speed.value).toBe(50)
    expect(await speed.handleGetRequest()).toBe(50)

    await speed.setValue(60)
    await vi.advanceTimersByTimeAsync(500)
    expect(device.setInfo).toHaveBeenLastCalledWith({
      device: { v1: { level: 0.6 } },
    })
    pushUpdate(device, { level: 0.6 })
    pushUpdate(device, { level: 0.8 })
    expect(speed.value).toBe(80)
  })
})
