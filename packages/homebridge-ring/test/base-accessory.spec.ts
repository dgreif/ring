import { describe, expect, it, vi } from 'vitest'
import { Subject } from 'rxjs'
import type { PlatformAccessory } from 'homebridge'
import { BaseAccessory } from '../base-accessory.ts'
import type { RingPlatformConfig } from '../config.ts'
import { createPlatformAccessory, emptyConfig, hap } from './harness.ts'

class TestAccessory extends BaseAccessory<{ name: string }> {
  readonly device = { name: 'Test Device' }
  readonly config: RingPlatformConfig = emptyConfig
  readonly onValue = new Subject<boolean>()
  readonly accessory: PlatformAccessory

  constructor(
    accessory: PlatformAccessory,
    setValue: (value: boolean) => unknown,
  ) {
    super()
    this.accessory = accessory
    this.getService(hap.Service.AccessoryInformation)
    this.registerObservableCharacteristic({
      characteristicType: hap.Characteristic.On,
      serviceType: hap.Service.Switch,
      onValue: this.onValue,
      setValue,
    })
  }
}

describe('BaseAccessory', () => {
  it('prunes cached services that are no longer registered, except camera streams', () => {
    const platformAccessory = createPlatformAccessory('Test', 'base-1')
    platformAccessory.addService(hap.Service.Lightbulb, 'Old Light')
    platformAccessory.addService(
      new hap.Service.CameraRTPStreamManagement('Stream', 'stream-0'),
    )

    new TestAccessory(platformAccessory, vi.fn()).initBase()

    expect(platformAccessory.getService(hap.Service.Lightbulb)).toBeUndefined()
    expect(platformAccessory.getService(hap.Service.Switch)).toBeDefined()
    expect(
      platformAccessory.getService(hap.Service.AccessoryInformation),
    ).toBeDefined()
    expect(
      platformAccessory.getService(hap.Service.CameraRTPStreamManagement),
    ).toBeDefined()
  })

  it('acks SET immediately and swallows async Ring failures', async () => {
    const platformAccessory = createPlatformAccessory('Test', 'base-2'),
      setValue = vi.fn(() => Promise.reject(new Error('Ring API down'))),
      accessory = new TestAccessory(platformAccessory, setValue)
    accessory.initBase()

    const on = platformAccessory
      .getService(hap.Service.Switch)!
      .getCharacteristic(hap.Characteristic.On)

    // A rejected setValue must be logged, not surface as an unhandled rejection
    expect(() => on.setValue(true)).not.toThrow()
    await vi.waitFor(() => expect(setValue).toHaveBeenCalledWith(true))

    accessory.onValue.next(false)
    expect(on.value).toBe(false)
  })
})
