import { RingDevice, RingDeviceData } from 'ring-client-api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { BaseDataAccessory } from './base-data-accessory'
import { PlatformAccessory } from 'homebridge'
import { ServiceType } from './base-accessory'

function getBatteryLevel({ batteryLevel, batteryStatus }: RingDeviceData) {
  if (batteryLevel !== undefined) {
    return batteryLevel
  } else if (batteryStatus === 'full' || batteryStatus === 'charged') {
    return 100
  } else if (batteryStatus === 'ok' || batteryStatus === 'charging') {
    return 50
  }
  return 0
}

function getStatusLowBattery(data: RingDeviceData) {
  const { StatusLowBattery } = hap.Characteristic,
    batteryLevel = getBatteryLevel(data)

  return batteryLevel > 20
    ? StatusLowBattery.BATTERY_LEVEL_NORMAL
    : StatusLowBattery.BATTERY_LEVEL_LOW
}

function getBatteryChargingState({
  batteryStatus,
  batteryBackup,
  acStatus,
}: RingDeviceData) {
  const { ChargingState } = hap.Characteristic

  if (
    batteryStatus === 'charging' ||
    batteryStatus === 'charged' ||
    batteryBackup === 'charged' ||
    batteryBackup === 'charging' ||
    acStatus === 'ok'
  ) {
    return ChargingState.CHARGING
  }

  if (batteryBackup === 'inUse' || acStatus === 'error') {
    return ChargingState.NOT_CHARGING
  }

  return ChargingState.NOT_CHARGEABLE
}

function hasBatteryStatus({ batteryStatus }: RingDeviceData) {
  return batteryStatus !== 'none'
}

export abstract class BaseDeviceAccessory extends BaseDataAccessory<RingDevice> {
  abstract readonly device: RingDevice
  abstract readonly accessory: PlatformAccessory
  abstract readonly config: RingPlatformConfig

  initBase() {
    const {
        device: { data: initialData },
        device,
      } = this,
      { Characteristic, Service } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.manufacturerName || 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.deviceType,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.serialNumber || 'Unknown',
    })

    if ('volume' in initialData && 'setVolume' in device) {
      this.registerCharacteristic({
        characteristicType: Characteristic.Mute,
        serviceType: Service.Speaker,
        getValue: () => false,
      })
      this.registerLevelCharacteristic({
        characteristicType: Characteristic.Volume,
        serviceType: Service.Speaker,
        getValue: (data) => {
          return data.volume ? data.volume * 100 : 0
        },
        setValue: (volume: number) => device.setVolume(volume / 100),
      })
    }

    if (hasBatteryStatus(initialData)) {
      this.registerCharacteristic({
        characteristicType: Characteristic.BatteryLevel,
        serviceType: Service.Battery,
        getValue: getBatteryLevel,
      })
      this.registerCharacteristic({
        characteristicType: Characteristic.StatusLowBattery,
        serviceType: Service.Battery,
        getValue: getStatusLowBattery,
      })
      this.registerCharacteristic({
        characteristicType: Characteristic.ChargingState,
        serviceType: Service.Battery,
        getValue: getBatteryChargingState,
      })
    }

    super.initBase()
  }

  initSensorService(serviceType: ServiceType) {
    const { Characteristic } = hap

    this.registerCharacteristic({
      characteristicType: Characteristic.StatusTampered,
      serviceType,
      getValue: (data) => {
        return data.tamperStatus === 'ok'
          ? Characteristic.StatusTampered.NOT_TAMPERED
          : Characteristic.StatusTampered.TAMPERED
      },
    })

    if (hasBatteryStatus(this.device.data)) {
      this.registerCharacteristic({
        characteristicType: Characteristic.StatusLowBattery,
        serviceType,
        getValue: (data) => getStatusLowBattery(data),
      })
    }
  }
}
