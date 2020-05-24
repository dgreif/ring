import { Logging, PlatformAccessory } from 'homebridge'

import { RingDevice } from '../api'
import { ThermostatMode } from '../api/ring-types'
import { BaseDeviceAccessory } from './base-device-accessory'
import { RingPlatformConfig } from './config'
import { hap } from './hap'

export class Thermostat extends BaseDeviceAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    // Required Characteristics

    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentHeatingCoolingState,
      serviceType: Service.Thermostat,
      getValue: async ({ setPoint, mode }) => {
        if (mode === 'off') {
          // The thermostat is set to 'off', so the thermostat is neither heating nor cooling
          return Characteristic.CurrentHeatingCoolingState.OFF
        }

        const temperature = await this.getTemperatureFromComponentDevices()
        if (!temperature || !setPoint) {
          return
        }
        // Checking with a threshold to avoid floating point weirdness
        const currentTemperatureEqualsTarget =
            Math.abs(temperature - setPoint) < 0.1,
          currentTemperatureIsHigherThanTarget = temperature - setPoint >= 0.1,
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
      },
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

    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: Service.Thermostat,
      getValue: async () => {
        const temperature = await this.getTemperatureFromComponentDevices()
        if (!temperature) {
          return
        }
        // Documentation: https://developers.homebridge.io/#/characteristic/CurrentTemperature
        // 'Characteristic.CurrentTemperature' supports 0.1 increments
        return Math.round(temperature * 10) / 10
      },
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

  async getTemperatureFromComponentDevices(): Promise<number | undefined> {
    const componentDevices = await this.device.getComponentDevices(),
      temperatureSensorDevice = componentDevices?.find(({ data }) =>
        data.deviceType.endsWith('sensor.temperature')
      ),
      temperature = temperatureSensorDevice?.data?.celsius

    if (!temperature) {
      this.logger.error(
        `Did not find a component temperature sensor for thermostat ${this.device.name}. Without a component temperature sensor, the current temperature cannot be read.`
      )
      return
    }
    return temperature
  }
}
