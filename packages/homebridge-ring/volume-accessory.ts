// packages/homebridge-ring/volume-accessory.ts
import { logError, logInfo } from 'ring-client-api/util'
import { hap } from './hap.ts'
import { BaseDeviceAccessory } from './base-device-accessory.ts'

/**
 * Expose Ring Alarm panel/keypad volume to HomeKit.
 *
 * Config:
 *   - exposeAlarmVolume?: boolean         // enable in platform config
 *   - volumeService?: 'lightbulb'|'fan'|'speaker' (default 'lightbulb')
 *
 * Mappings:
 *   - Lightbulb.Brightness (0..100)  <-> volume (0.0..1.0)
 *   - Fan.RotationSpeed (0..100)     <-> volume (0.0..1.0)
 *   - Speaker.Volume (0..100)        <-> volume (0.0..1.0)
 *   - On (Light/Fan): >0 = true; Off => set volume=0
 *   - Speaker.Mute: true => 0, false => restore last %
 */
export class VolumeAccessory extends BaseDeviceAccessory {
  constructor(public device: any, public accessory: any, public config: any) {
    super()
    // remember last non-zero % so toggling On can restore it
    if (typeof this.accessory.context.volumePct !== 'number') {
      this.accessory.context.volumePct = 100
    }
    this.init()
  }

  private init() {
    const svcPref = (this.config?.volumeService ?? 'lightbulb') as
      | 'lightbulb'
      | 'fan'
      | 'speaker'

    if (svcPref === 'speaker') {
      this.initAsSpeaker()
    } else if (svcPref === 'fan') {
      this.initAsFan()
    } else {
      this.initAsLightbulb()
    }
  }

  // ---------- Lightbulb variant (default) ----------
  private initAsLightbulb() {
    const { Service, Characteristic } = hap
    const service = this.getService(Service.Lightbulb)
    service.setCharacteristic(Characteristic.Name, `${this.device.name} Volume`)

    // Brightness: 0..100
    this.registerLevelCharacteristic({
      characteristicType: Characteristic.Brightness,
      serviceType: Service.Lightbulb,
      getValue: (data: any) => this.getPercent(data),
      setValue: (pct: number) => this.setPercent(pct),
    })

    // On: >0 => true; Off => set to 0
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: Service.Lightbulb,
      getValue: (data: any) => this.getPercent(data) > 0,
      setValue: (on: unknown) => {
        const isOn = Boolean(on)
        const restore = this.accessory.context.volumePct || 100
        return this.setPercent(isOn ? restore : 0)
      },
    })
  }

  // ---------- Fan variant ----------
  private initAsFan() {
    const { Service, Characteristic } = hap
    // HAP-NodeJS may have Fanv2; fall back to Fan
    const FanService: any = (Service as any).Fanv2 ?? Service.Fan
    const service = this.getService(FanService)
    service.setCharacteristic(Characteristic.Name, `${this.device.name} Volume`)

    // RotationSpeed: 0..100
    this.registerLevelCharacteristic({
      characteristicType: Characteristic.RotationSpeed,
      serviceType: FanService,
      getValue: (data: any) => this.getPercent(data),
      setValue: (pct: number) => this.setPercent(pct),
    })

    // On mirrors >0%
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: FanService,
      getValue: (data: any) => this.getPercent(data) > 0,
      setValue: (on: unknown) => {
        const isOn = Boolean(on)
        const restore = this.accessory.context.volumePct || 100
        return this.setPercent(isOn ? restore : 0)
      },
    })
  }

  // ---------- Speaker variant ----------
  private initAsSpeaker() {
    const { Service, Characteristic } = hap
    const service = this.getService(Service.Speaker)
    service.setCharacteristic(Characteristic.Name, `${this.device.name} Volume`)

    // Volume: 0..100
    this.registerLevelCharacteristic({
      characteristicType: Characteristic.Volume,
      serviceType: Service.Speaker,
      getValue: (data: any) => this.getPercent(data),
      setValue: (pct: number) => this.setPercent(pct),
    })

    // Optional Mute: true => 0, false => restore last %
    this.registerCharacteristic({
      characteristicType: Characteristic.Mute,
      serviceType: Service.Speaker,
      getValue: (data: any) => this.getPercent(data) <= 0,
      setValue: (mute: unknown) => {
        const m = Boolean(mute)
        const restore = this.accessory.context.volumePct || 100
        return this.setPercent(m ? 0 : restore)
      },
    })
  }

  // ---------- Helpers ----------
  private getPercent(data: any): number {
    const raw = Number(data?.volume ?? this.device?.data?.volume ?? 0)
    const pct = Math.round(this.clamp01(raw) * 100)
    // remember last non-zero
    if (pct > 0) {
      this.accessory.context.volumePct = pct
    }
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
      if (pct > 0) {
        this.accessory.context.volumePct = pct
      }
    } catch (e) {
      logError(e)
      // let BaseDeviceAccessory / HomeKit refresh from device state on next poll/update
    }
  }

  private clamp01(n: number) {
    if (isNaN(n)) return 0
    return n < 0 ? 0 : n > 1 ? 1 : n
  }
}
