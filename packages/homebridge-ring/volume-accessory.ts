// packages/homebridge-ring/volume-accessory.ts
import { logError, logInfo } from 'ring-client-api/util'
import { hap } from './hap.ts'
import { BaseDeviceAccessory } from './base-device-accessory.ts'

/**
 * Presents device volume as a HomeKit control with a slider.
 * Supports:
 *   - Lightbulb.Brightness (0..100)  <-> volume (0.0..1.0)  [default]
 *   - Fan.RotationSpeed (0..100)     <-> volume (0.0..1.0)
 *   - Speaker.Volume (0..100)        <-> volume (0.0..1.0) + Mute
 *
 * Config:
 *   - exposeAlarmVolume?: boolean
 *   - volumeService?: 'lightbulb' | 'fan' | 'speaker'   // default 'lightbulb'
 */
export class VolumeAccessory extends BaseDeviceAccessory {
  public device: any
  public accessory: any
  public config: any

  private service: any
  private pctCharacteristic: any
  private hasOn = false
  private hasMute = false

  constructor(device: any, accessory: any, config: any) {
    super() // Base class takes no args

    this.device = device
    this.accessory = accessory
    this.config = config

    // Remember last non-zero percent so toggling On/Mute can restore it
    if (typeof this.accessory.context.volumePct !== 'number') {
      this.accessory.context.volumePct = 100
    }

    // Choose service flavor
    const svcPref = (this.config?.volumeService ?? 'lightbulb') as
      | 'lightbulb'
      | 'fan'
      | 'speaker'

    const { Service, Characteristic } = hap

    if (svcPref === 'speaker') {
      this.service = this.getService(Service.Speaker)
      this.service.setCharacteristic(
        Characteristic.Name,
        `${this.device.name} Volume`,
      )
      this.pctCharacteristic = Characteristic.Volume
      this.hasMute = true
    } else if (svcPref === 'fan') {
      const FanService: any = (Service as any).Fanv2 ?? Service.Fan
      this.service = this.getService(FanService)
      this.service.setCharacteristic(
        Characteristic.Name,
        `${this.device.name} Volume`,
      )
      this.pctCharacteristic = Characteristic.RotationSpeed
      this.hasOn = true
    } else {
      // default lightbulb
      this.service = this.getService(Service.Lightbulb)
      this.service.setCharacteristic(
        Characteristic.Name,
        `${this.device.name} Volume`,
      )
      this.pctCharacteristic = Characteristic.Brightness
      this.hasOn = true
    }

    // Percent slider (Brightness/RotationSpeed/Volume)
    this.service
      .getCharacteristic(this.pctCharacteristic)
      .onGet(() => this.getPercent())
      .onSet(async (value: unknown) => {
        const pct = Math.max(0, Math.min(100, Number(value)))
        await this.setPercent(pct)
      })

    // On (for Lightbulb/Fan variants): >0 => true, Off => set 0
    if (this.hasOn) {
      this.service
        .getCharacteristic(Characteristic.On)
        .onGet(() => this.getPercent() > 0)
        .onSet(async (value: unknown) => {
          const on = Boolean(value)
          const restore = this.accessory.context.volumePct || 100
          await this.setPercent(on ? restore : 0)
        })
    }

    // Mute (for Speaker variant): true => 0, false => restore last %
    if (this.hasMute) {
      this.service
        .getCharacteristic(Characteristic.Mute)
        .onGet(() => this.getPercent() <= 0)
        .onSet(async (value: unknown) => {
          const mute = Boolean(value)
          const restore = this.accessory.context.volumePct || 100
          await this.setPercent(mute ? 0 : restore)
        })
    }

    // Keep HomeKit in sync when device data changes
    this.device.onData.subscribe((data: any) => {
      const vol = typeof data?.volume === 'number' ? data.volume : undefined
      if (typeof vol !== 'number') {
        return
      }
      const pct = Math.round(this.clamp01(vol) * 100)
      if (pct > 0) this.accessory.context.volumePct = pct

      this.service.updateCharacteristic(this.pctCharacteristic, pct)

      if (this.hasOn) {
        this.service.updateCharacteristic(hap.Characteristic.On, pct > 0)
      }
      if (this.hasMute) {
        this.service.updateCharacteristic(hap.Characteristic.Mute, pct <= 0)
      }
    })
  }

  private getPercent(): number {
    const raw = Number(this.device?.data?.volume ?? 0)
    const pct = Math.round(this.clamp01(raw) * 100)
    if (pct > 0) this.accessory.context.volumePct = pct
    return pct
  }

  private async setPercent(pctInput: unknown) {
    const pct = Math.max(0, Math.min(100, Number(pctInput)))
    const vol = pct / 100
    try {
      if (typeof this.device?.setVolume !== 'function') {
        throw new Error(`Device ${this.device?.name ?? 'unknown'} has no setVolume()`)
      }
      logInfo(`Setting ${this.device.name} volume to ${pct}%`)
      await this.device.setVolume(this.clamp01(vol))
      if (pct > 0) this.accessory.context.volumePct = pct
    } catch (e) {
      logError(e)
      // let normal polling/device events refresh HomeKit later
    }
  }

  private clamp01(n: number) {
    if (isNaN(n)) return 0
    return n < 0 ? 0 : n > 1 ? 1 : n
  }
}
