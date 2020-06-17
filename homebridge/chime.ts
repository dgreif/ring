import { RingChime } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'
import { BaseDataAccessory } from './base-data-accessory'
import { logInfo } from '../api/util'

const secondsFor24Hours = 60 * 60 * 24
const elapsedTime = (elapsed: number) => {
    const hours = Math.floor(elapsed / 3600),
        minutes = Math.floor(elapsed / 60) % 60,
        seconds = elapsed % 60
    return `${hours}:${minutes.toString().padStart(2, '0')}:${Math.round(seconds).toString().padStart(2, '0')}`
}

export class Chime extends BaseDataAccessory<RingChime> {
  constructor(
    public readonly device: RingChime,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()
    const { Characteristic, Service } = hap,
      snoozeService = this.getService(
        Service.Valve,
        device.name + ' Snooze',
        'snooze'
      ),
      playDingService = this.getService(
        Service.Switch,
        device.name + ' Play Ding',
        'play-ding'
      ),
      playMotionService = this.getService(
        Service.Switch,
        device.name + ' Play Motion',
        'play-motion'
      )

    // Snooze Switch
    this.registerCharacteristic({
      characteristicType: Characteristic.InUse,
      serviceType: snoozeService,
      getValue: (data) => Boolean(data.do_not_disturb.seconds_left),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Active,
      serviceType: snoozeService,
      getValue: (data) => Boolean(data.do_not_disturb.seconds_left),
      setValue: (snooze: boolean) => {
        if (snooze) {
          logInfo(`${device.name} snoozed for ${elapsedTime(secondsFor24Hours)}`)
          snoozeService.getCharacteristic(Characteristic.InUse).updateValue(1)
          return device.snooze(Math.round(secondsFor24Hours / 60)) // in minutes
        }

        logInfo(device.name + ' snooze cleared')
        snoozeService.getCharacteristic(Characteristic.InUse).updateValue(0)
        return device.clearSnooze()
      }
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.ValveType,
      serviceType: snoozeService,
      getValue: () => 0,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SetDuration,
      serviceType: snoozeService,
      getValue: (data) =>
        Number(data.do_not_disturb.seconds_left),
      setValue: (snoozeSec: number) => {
        if (snoozeSec > 0) {
          logInfo(`${device.name} snoozed for ${elapsedTime(snoozeSec)}`)
          return device.snooze(Math.round(snoozeSec / 60)) // in minutes
        }

        logInfo(device.name + ' snooze cleared')
        return device.clearSnooze()
      },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.RemainingDuration,
      serviceType: snoozeService,
      getValue: (data) =>
        Number(data.do_not_disturb.seconds_left),
      requestUpdate: () => device.requestUpdate(),
    })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.SetDuration)
      .setProps({
        minValue: 0,
        maxValue: secondsFor24Hours,
      })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.RemainingDuration)
      .setProps({
        minValue: 0,
        maxValue: secondsFor24Hours,
      })
    snoozeService.setPrimaryService(true)

    // Speaker Service
    this.registerCharacteristic({
      characteristicType: Characteristic.Mute,
      serviceType: Service.Speaker,
      getValue: () => false,
    })
    this.registerLevelCharacteristic({
      characteristicType: Characteristic.Volume,
      serviceType: Service.Speaker,
      getValue: (data) => data.settings.volume,
      setValue: (volume: number) => device.setVolume(volume),
      requestUpdate: () => device.requestUpdate(),
    })
    this.getService(Service.Speaker)
      .getCharacteristic(Characteristic.Volume)
      .setProps({
        minValue: 0,
        maxValue: 11,
      })

    // Play Sound Switches
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: playDingService,
      getValue: () => false,
      setValue: (play: boolean) => {
        if (!play) {
          return
        }

        setTimeout(() => {
          playDingService
            .getCharacteristic(Characteristic.On)
            .updateValue(false)
        }, 1000)
        return this.device.playSound('ding')
      },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: playMotionService,
      getValue: () => false,
      setValue: (play: boolean) => {
        if (!play) {
          return
        }

        setTimeout(() => {
          playMotionService
            .getCharacteristic(Characteristic.On)
            .updateValue(false)
        }, 1000)
        return this.device.playSound('motion')
      },
      requestUpdate: () => device.requestUpdate(),
    })

    // Accessory Information Service
    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: () => device.model,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.device_id || 'Unknown',
    })
  }
}
