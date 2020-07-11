import { RingChime } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'
import { BaseDataAccessory } from './base-data-accessory'
import { logInfo } from '../api/util'

const secondsFor1Hour = 60 * 60,
  elapsedTime = (elapsed: number) => {
    elapsed *= secondsFor1Hour
    const hours = Math.floor(elapsed / secondsFor1Hour),
      minutes = Math.floor(elapsed / 60) % 60,
      seconds = Math.round(elapsed % 60)
    return `${hours}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

// Temperature conversion for C to F
// Set useF based on your default HomeKit display
//
// Since HomeKit stores everything in Celsius, this results in some (minor) differences
// in terms of snooze times. For example, 15:06:00 instead of 15:00:00 snooze. This could be
// addressed differently if more accuracy is needed.
//
// Lastly, there are some oddities at the boundaries, so some numbers have been chosen manually
// I.e., -17.77 or 25.5 for optimal behavior

const roundSingle = (num: number) => Math.round((num + Number.EPSILON) * 10) / 10,
  CtoF = (temp: number) => roundSingle(1.8 * temp + 32),
  FtoC = (temp: number) =>
    temp === 0 ? -17.77 : roundSingle((temp - 32) / 1.8),
  useF = true

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
      getValue: (data) =>
        data.do_not_disturb.seconds_left > 0
          ? Characteristic.TargetHeatingCoolingState.HEAT
          : Characteristic.TargetHeatingCoolingState.OFF,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.TargetHeatingCoolingState,
      serviceType: snoozeService,
      getValue: (data) =>
        data.do_not_disturb.seconds_left > 0
          ? Characteristic.TargetHeatingCoolingState.HEAT
          : Characteristic.TargetHeatingCoolingState.OFF,
      setValue: (state: number) => {
        if (state === Characteristic.TargetHeatingCoolingState.OFF) {
          logInfo(device.name + ' snooze cleared')
          snoozeService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(Characteristic.CurrentHeatingCoolingState.OFF)
          snoozeService
            .getCharacteristic(Characteristic.TargetTemperature)
            .updateValue(useF ? FtoC(0) : 0)
          snoozeService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .updateValue(useF ? FtoC(0) : 0)
          return device.clearSnooze()
        }
      },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: snoozeService,
      getValue: (data) => {
        const hours: number = data.do_not_disturb.seconds_left / secondsFor1Hour
        return useF ? FtoC(hours) : hours
      },
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.TargetTemperature,
      serviceType: snoozeService,
      getValue: (data) => {
        const hours: number = data.do_not_disturb.seconds_left / secondsFor1Hour
        return useF ? FtoC(hours) : hours
      },
      setValue: (snoozeHours: number) => {
        snoozeHours = useF ? CtoF(snoozeHours) : snoozeHours
        if (snoozeHours > 24) {
          snoozeHours = 24 // limit per Ring API
        }

        if (snoozeHours > 0) {
          logInfo(`${device.name} snoozed for ${elapsedTime(snoozeHours)}`)
          snoozeService
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .updateValue(Characteristic.CurrentHeatingCoolingState.HEAT)
          snoozeService
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .updateValue(Characteristic.TargetHeatingCoolingState.HEAT)

          return device.snooze(Math.round(snoozeHours * 60)) // in minutes
        }

        snoozeService.setCharacteristic(
          Characteristic.TargetHeatingCoolingState,
          Characteristic.TargetHeatingCoolingState.OFF
        )
      },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.TemperatureDisplayUnits,
      serviceType: snoozeService,
      getValue: () => Characteristic.TemperatureDisplayUnits.CELSIUS,
    })

    this.getService(snoozeService)
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          Characteristic.TargetHeatingCoolingState.OFF,
          Characteristic.TargetHeatingCoolingState.HEAT,
        ],
      })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.CurrentTemperature)
      .setProps({
        minValue: useF ? FtoC(0) : 0,
        maxValue: useF ? FtoC(25.5) : 24,
        minStep: 0.1,
      })
    this.getService(snoozeService)
      .getCharacteristic(Characteristic.TargetTemperature)
      .setProps({
        minValue: useF ? FtoC(0) : 0,
        maxValue: useF ? FtoC(25.5) : 24,
        minStep: 0.1,
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
