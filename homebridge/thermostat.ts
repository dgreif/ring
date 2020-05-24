import { Logging, PlatformAccessory } from 'homebridge'
import { Observable, combineLatest } from 'rxjs'
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators'

import { RingDevice } from '../api'
import { RingDeviceType, ThermostatMode } from '../api/ring-types'
import { BaseDeviceAccessory } from './base-device-accessory'
import { RingPlatformConfig } from './config'
import { hap } from './hap'

export class Thermostat extends BaseDeviceAccessory {
  private onTemperature: Observable<number | undefined>

  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    // Component Device (Temperature Sensor)

    this.onTemperature = this.device.onComponentDevices.pipe(
      switchMap((devices) => {
        const temperatureSensor = devices.find(
          ({ deviceType }) => deviceType === RingDeviceType.TemperatureSensor
        )
        if (!temperatureSensor) {
          return []
        }
        this.logger.debug(
          `Discovered a component temperature sensor for ${this.device.name}`
        )
        return temperatureSensor.onData.pipe(
          map(({ celsius: temperature }) => {
            this.logger.debug(
              `Component temperature sensor for ${this.device.name} reported ${temperature} degrees`
            )
            return temperature
          }),
          distinctUntilChanged()
        )
      })
    )

    // Required Characteristics

    this.registerObservableCharacteristic({
      characteristicType: Characteristic.CurrentHeatingCoolingState,
      serviceType: Service.Thermostat,
      onValue: combineLatest([this.onTemperature, this.device.onData]).pipe(
        map(([temperature, { setPoint, mode }]) => {
          if (mode === 'off') {
            // The thermostat is set to 'off', so the thermostat is neither heating nor cooling
            return Characteristic.CurrentHeatingCoolingState.OFF
          }

          if (!temperature || !setPoint) {
            this.logger.error(
              `Could not determine 'CurrentHeatingCoolingState' for ${this.device.name} given temperature: ${temperature}, set point: ${setPoint} and mode: ${mode}. Reporting 'off' state as a fallback.`
            )
            return Characteristic.CurrentHeatingCoolingState.OFF
          }
          // Checking with a threshold to avoid floating point weirdness
          const currentTemperatureEqualsTarget =
              Math.abs(temperature - setPoint) < 0.1,
            currentTemperatureIsHigherThanTarget =
              temperature - setPoint >= 0.1,
            currentTemperatureIsLowerThanTarget = temperature - setPoint <= -0.1

          if (currentTemperatureEqualsTarget) {
            // The target temperature has been reached, so the thermostat is neither heating nor cooling
            return Characteristic.CurrentHeatingCoolingState.OFF
          }
          if (currentTemperatureIsHigherThanTarget && mode === 'cool') {
            // The current temperature is higher than the target temperature,
            // and the thermostat is set to 'cool', so the thermostat is cooling
            return Characteristic.CurrentHeatingCoolingState.COOL
          }
          if (
            currentTemperatureIsLowerThanTarget &&
            (mode === 'heat' || mode === 'aux')
          ) {
            // The current temperature is lower than the target temperature,
            // and the thermostat is set to 'heat' or 'aux' (emergency heat), so the thermostat is heating
            return Characteristic.CurrentHeatingCoolingState.HEAT
          }
          // The current temperature is either higher or lower than the target temperature,
          // but the current thermostat mode would only increase the difference,
          // so the thermostat is neither heating nor cooling
          return Characteristic.CurrentHeatingCoolingState.OFF
        })
      ),
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TargetHeatingCoolingState,
      serviceType: Service.Thermostat,
      getValue: ({ mode }) => {
        switch (mode) {
          case 'off':
            return Characteristic.TargetHeatingCoolingState.OFF
          case 'heat':
          case 'aux':
            return Characteristic.TargetHeatingCoolingState.HEAT
          case 'cool':
            return Characteristic.TargetHeatingCoolingState.COOL
        }
      },
      setValue: (targetHeatingCoolingState: number) => {
        const mode: ThermostatMode | undefined = (():
          | ThermostatMode
          | undefined => {
          switch (targetHeatingCoolingState) {
            case Characteristic.TargetHeatingCoolingState.OFF:
              return 'off'
            case Characteristic.TargetHeatingCoolingState.HEAT:
              return 'heat'
            case Characteristic.TargetHeatingCoolingState.COOL:
              return 'cool'
            default:
              return
          }
        })()
        if (!mode) {
          this.logger.error(
            `Couldn’t match ${targetHeatingCoolingState} to a recognized mode string.`
          )
          return
        }
        this.logger.info(`Setting ${this.device.name} mode to ${mode}`)

        return this.device.setInfo({ device: { v1: { mode } } })
      },
    })
    // Only allow 'TargetHeatingCoolingState's which can be mapped to Ring modes
    // Specifically, this omits .AUTO
    this.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .setProps({
        validValues: [
          Characteristic.TargetHeatingCoolingState.OFF,
          Characteristic.TargetHeatingCoolingState.HEAT,
          Characteristic.TargetHeatingCoolingState.COOL,
        ],
      })

    this.registerObservableCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: Service.Thermostat,
      onValue: this.onTemperature.pipe(
        map((temperature) => {
          if (!temperature) {
            this.logger.error(
              `Could not determine 'CurrentTemperature' for ${this.device.name} given temperature: ${temperature}. Returning 22 degrees celsius as a fallback.`
            )
            return 22
          }
          // Documentation: https://developers.homebridge.io/#/characteristic/CurrentTemperature
          // 'Characteristic.CurrentTemperature' supports 0.1 increments
          return Number(Number(temperature).toFixed(1))
        })
      ),
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TargetTemperature,
      serviceType: Service.Thermostat,
      getValue: ({ setPoint }) => {
        return setPoint
      },
      setValue: (setPoint: number) => {
        this.logger.info(
          `Setting ${this.device.name} target temperature to ${setPoint}`
        )

        // Documentation: https://developers.homebridge.io/#/characteristic/TargetTemperature
        // 'Characteristic.TargetTemperature' has a valid range from 10 to 38 degrees celsius,
        // but devices may support a different range. When limits differ, accept the more strict.
        const setPointMin = Math.max(this.device.data.setPointMin || 10, 10),
          setPointMax = Math.min(this.device.data.setPointMax || 38, 38)

        if (setPoint < setPointMin || setPoint > setPointMax) {
          this.logger.error(
            `Ignoring request to set ${this.device.name} target temperature to ${setPoint}. Target temperature must be between ${setPointMin} and ${setPointMax}.`
          )
          return
        }

        return this.device.setInfo({ device: { v1: { setPoint } } })
      },
    })
    if (this.device.data.setPointMin || this.device.data.setPointMax) {
      // Documentation: https://developers.homebridge.io/#/characteristic/TargetTemperature
      // 'Characteristic.TargetTemperature' has a valid range from 10 to 38 degrees celsius,
      // but devices may support a different range. When limits differ, accept the more strict.
      const setPointMin = Math.max(this.device.data.setPointMin || 10, 10),
        setPointMax = Math.min(this.device.data.setPointMax || 38, 38)
      this.logger.debug(
        `Setting ${this.device.name} target temperature range to ${setPointMin}–${setPointMax}`
      )
      this.getService(Service.Thermostat)
        .getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
          minValue: setPointMin,
          maxValue: setPointMax,
          validValueRanges: [setPointMin, setPointMax],
        })
    }

    this.registerCharacteristic({
      characteristicType: Characteristic.TemperatureDisplayUnits,
      serviceType: Service.Thermostat,
      getValue: () => {
        // Neither thermostats nor their component devices (e.g. temperature sensors)
        // appear to include the unit preference. Hardcoding Fahrenheit as the default.
        return Characteristic.TemperatureDisplayUnits.FAHRENHEIT
      },
      setValue: () => {
        // noop
        // Setting display unit is unsupported
      },
    })
    // Setting 'TemperatureDisplayUnits' is unsupported by the Ring API.
    // We’ve defaulted to Fahrenheit above, so only allowing .FAHRENHEIT.
    this.getService(Service.Thermostat)
      .getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .setProps({
        validValues: [Characteristic.TemperatureDisplayUnits.FAHRENHEIT],
      })
  }
}
