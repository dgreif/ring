// packages/homebridge-ring/volume-accessory.ts
import { logError, logInfo } from 'ring-client-api/util'
import { hap } from './hap.ts'
import { BaseDeviceAccessory } from './base-device-accessory.ts'

/**
 * Presents device volume as a HomeKit slider.
 * Maps Brightness (0–100) <-> Ring volume (0.0–1.0).
 * Attaches to any Ring device that:
 *   - exposes data.volume (number)
 *   - implements setVolume(number)
 */
export class VolumeAccessory extends BaseDeviceAccessory {
  // BaseDeviceAccessory in this repo expects subclasses to expose these fields
  public device: any
  public accessory: any
  public config: any

  constructor(device: any, accessory: any, config: any) {
    super() // Base class takes no constructor args in this codebase

    this.device = device
    this.accessory = accessory
    this.config = config

    // Create a Lightbulb so Home shows a visible slider (Brightness)
    this.service = this.getService(hap.Service.Lightbulb)
    this.init()
  }

  private service: any

  private init() {
    // "<Device Name> Volume"
    this.service.setCharacteristic(
      hap.Characteristic.Name,
      `${this.device.name} Volume`,
    )

    // Required On characteristic (true if volume > 0)
    this.service
      .getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.currentVolume() > 0)
      .onSet(async (value: unknown) => {
        const on = Boolean(value)
        if (!on) {
          await this.setVolume(0)
        }
        // Turning on is handled by Brightness updates
      })

    // Brightness is the actual volume slider
    this.service
      .getCharacteristic(hap.Characteristic.Brightness)
      .onGet(() => Math.round(this.currentVolume() * 100))
      .onSet(async (value: unknown) => {
        const pct = Math.max(0, Math.min(100, Number(value)))
        await this.setVolume(pct / 100)
      })

    // Keep HomeKit in sync if device data changes
    this.device.onData.subscribe((data: any) => {
      const vol = typeof data?.volume === 'number' ? data.volume : undefined
      if (typeof vol === 'number') {
        this.service.updateCharacteristic(
          hap.Characteristic.Brightness,
          Math.round(vol * 100),
        )
        this.service.updateCharacteristic(hap.Characteristic.On, vol > 0)
      }
    })
  }

  private currentVolume(): number {
    const vol = this.device?.data?.volume
    return typeof vol === 'number' ? vol : 1
  }

  private async setVolume(vol: number) {
    try {
      const dev: any = this.device
      if (typeof dev?.setVolume === 'function') {
        await dev.setVolume(vol)
        logInfo(`Set ${dev.name} volume to ${Math.round(vol * 100)}%`)
      } else {
        throw new Error(
          `Device ${dev?.name ?? 'unknown'} does not support setVolume()`,
        )
      }
    } catch (e) {
      logError(e)
      // Reflect last known device volume back to HomeKit
      const back = this.currentVolume()
      this.service.updateCharacteristic(
        hap.Characteristic.Brightness,
        Math.round(back * 100),
      )
      this.service.updateCharacteristic(hap.Characteristic.On, back > 0)
    }
  }
}