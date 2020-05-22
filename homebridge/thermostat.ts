import { Logging, PlatformAccessory } from 'homebridge'

import { RingDevice } from '../api'
import { ThermostatMode } from '../api/ring-types'
import { BaseDeviceAccessory } from './base-device-accessory'
import { RingPlatformConfig } from './config'
import { hap } from './hap'

export class ExampleThermostatAccessory extends BaseDeviceAccessory {
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
      getValue: ({ mode }) => {
        switch (mode) {
          case 'off':
            return Characteristic.CurrentHeatingCoolingState.OFF
          case 'heat':
            return Characteristic.CurrentHeatingCoolingState.HEAT
          case 'cool':
            return Characteristic.CurrentHeatingCoolingState.COOL
        }
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TargetHeatingCoolingState,
      serviceType: Service.Thermostat,
      getValue: ({ mode }) => {
        switch (mode) {
          case 'off':
            return Characteristic.CurrentHeatingCoolingState.OFF
          case 'heat':
            return Characteristic.CurrentHeatingCoolingState.HEAT
          case 'cool':
            return Characteristic.CurrentHeatingCoolingState.COOL
        }
      },
      setValue: (mode: ThermostatMode) => {
        this.logger.info(`Setting ${this.device.name} mode to ${mode}`)

        return this.device.setInfo({ device: { v1: { mode } } })
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: Service.Thermostat,
      getValue: ({ componentDevices }) => {
        const temperatureSensorData =
          componentDevices &&
          componentDevices.find((data) =>
            data.rel.endsWith('sensor.temperature')
          )

        if (
          !temperatureSensorData ||
          !('celsius' in temperatureSensorData) ||
          !temperatureSensorData.celsius
        ) {
          this.logger.error(
            `Did not find a component temperature sensor for thermostat ${this.device.name}. Without a component temperature sensor, the current temperature cannot be read.`
          )
          return
        }

        // Documentation: https://developers.homebridge.io/#/characteristic/CurrentTemperature
        // 'Characteristic.CurrentTemperature' supports 0.1 increments
        return Math.round(temperatureSensorData.celsius * 10) / 10
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
  }
}
