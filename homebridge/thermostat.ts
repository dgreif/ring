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

    // Required

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
        this.setTargetHeatingCoolingState(mode)
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentTemperature,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 0–100 celsius in 0.1 steps
         */
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TargetTemperature,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 10–38 celsius in 0.1 steps
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TemperatureDisplayUnits,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns:
         * - 0 (Characteristic.TemperatureDisplayUnits.CELSIUS)
         * - 1 (Characteristic.TemperatureDisplayUnits.FAHRENHEIT)
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })

    // Optional

    this.registerCharacteristic({
      characteristicType: Characteristic.CurrentRelativeHumidity,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 0–100 celsius in 1 steps
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.TargetRelativeHumidity,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 0–100 celsius in 1 steps
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.CoolingThresholdTemperature,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 10–35 celsius in 0.1 steps
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.HeatingThresholdTemperature,
      serviceType: Service.Thermostat,
      getValue: () => {
        /**
         * returns: 0–25 celsius in 0.1 steps
         */
      },
      setValue: () => {
        /* MUSTDO */
      },
    })
  }

  setTargetHeatingCoolingState(mode: ThermostatMode) {
    this.logger.info(`Setting ${this.device.name} mode to ${mode}`)

    return this.device.setInfo({ device: { v1: { mode } } })
  }
}
