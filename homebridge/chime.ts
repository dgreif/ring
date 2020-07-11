import { RingChime } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'
import { BaseDataAccessory } from './base-data-accessory'
import { logInfo } from '../api/util'

const secondsFor1Hour = 60 * 60
const elapsedTime = (elapsed: number) => {
    elapsed *= secondsFor1Hour
    const hours = Math.floor(elapsed / secondsFor1Hour),
        minutes = Math.floor(elapsed / 60) % 60,
        seconds = Math.round(elapsed % 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
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
        Service.Thermostat,
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
      characteristicType: Characteristic.CurrentHeatingCoolingState,
      serviceType: snoozeService,
      getValue: (data) => data.do_not_disturb.seconds_left > 0 ?
                            Characteristic.TargetHeatingCoolingState.HEAT :
                            Characteristic.TargetHeatingCoolingState.OFF,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.TargetHeatingCoolingState,
      serviceType: snoozeService,
      getValue: (data) => data.do_not_disturb.seconds_left > 0 ?
                            Characteristic.TargetHeatingCoolingState.HEAT :
                            Characteristic.TargetHeatingCoolingState.OFF,
      setValue: (state: number) => {
          if (state === Characteristic.TargetHeatingCoolingState.OFF) {
            logInfo(device.name + ' snooze cleared')
            snoozeService
              .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
              .updateValue(Characteristic.TargetHeatingCoolingState.OFF)
            snoozeService
              .getCharacteristic(Characteristic.TargetTemperature)
              .updateValue(0)
            snoozeService
              .getCharacteristic(Characteristic.CurrentTemperature)
              .updateValue(0)
            return device.clearSnooze()
          }
       },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: snoozeService,
      getValue: (data) => Number(Math.round((data.do_not_disturb.seconds_left / secondsFor1Hour) * 10) / 10),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.TargetTemperature,
      serviceType: snoozeService,
      getValue: (data) => Number(Math.round((data.do_not_disturb.seconds_left / secondsFor1Hour) * 10) / 10),
      setValue: (snoozeHours: number) => {
        if (snoozeHours > 0) {
          logInfo(`${device.name} snoozed for ${elapsedTime(snoozeHours)}`)
          snoozeService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(Characteristic.TargetHeatingCoolingState.HEAT)

          return device.snooze(Math.round(snoozeHours * 60)) // in minutes
        }

        snoozeService
          .setCharacteristic(Characteristic.TargetHeatingCoolingState, Characteristic.TargetHeatingCoolingState.OFF)
      },
      requestUpdate: () => device.requestUpdate(),
    })

    this.getService(snoozeService)
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
          validValues: [Characteristic.TargetHeatingCoolingState.OFF, Characteristic.TargetHeatingCoolingState.HEAT]
      })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: 0.0,
        maxValue: 24.0,
        minStep: 0.1
      })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.TargetTemperature)
      .setProps({
        minValue: 0.0,
        maxValue: 24.0,
        minStep: 0.1
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
