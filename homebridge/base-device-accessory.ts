import { RingDevice, RingDeviceData } from '../api'
import { HAP, hap } from './hap'
import Service = HAP.Service
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import { Subject } from 'rxjs'
import { RingAlarmPlatformConfig } from './config'
import { BaseAccessory } from './base-accessory'

function getBatteryLevel({ batteryLevel, batteryStatus }: RingDeviceData) {
  if (batteryLevel !== undefined) {
    return batteryLevel
  } else if (batteryStatus === 'full') {
    return 100
  } else if (batteryStatus === 'ok') {
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
  batteryBackup
}: RingDeviceData) {
  const { ChargingState } = hap.Characteristic

  if (
    batteryStatus === 'charging' ||
    batteryBackup === 'charged' ||
    batteryBackup === 'charging'
  ) {
    return ChargingState.CHARGING
  }

  return ChargingState.NOT_CHARGEABLE
}

function hasBatteryStatus({ batteryStatus }: RingDeviceData) {
  return batteryStatus !== 'none'
}

export abstract class BaseDeviceAccessory extends BaseAccessory<RingDevice> {
  abstract readonly device: RingDevice
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log
  abstract readonly config: RingAlarmPlatformConfig

  protected constructor() {
    super()
    setTimeout(() => this.initBase())
  }

  private initBase() {
    const {
        device: { data: initialData },
        device
      } = this,
      { Characteristic, Service } = hap

    this.registerCharacteristic(
      Characteristic.Manufacturer,
      Service.AccessoryInformation,
      data => data.manufacturerName || 'Ring'
    )
    this.registerCharacteristic(
      Characteristic.Model,
      Service.AccessoryInformation,
      data => data.deviceType
    )
    this.registerCharacteristic(
      Characteristic.SerialNumber,
      Service.AccessoryInformation,
      data => data.serialNumber || 'Unknown'
    )

    if ('volume' in initialData && 'setVolume' in device) {
      this.registerCharacteristic(
        Characteristic.Mute,
        Service.Speaker,
        () => false
      )
      this.registerLevelCharacteristic(
        Characteristic.Volume,
        Service.Speaker,
        data => {
          return data.volume ? data.volume * 100 : 0
        },
        (volume: number) => {
          device.setVolume(volume / 100)
        }
      )
    }

    if (hasBatteryStatus(initialData)) {
      this.registerCharacteristic(
        Characteristic.BatteryLevel,
        Service.BatteryService,
        getBatteryLevel
      )
      this.registerCharacteristic(
        Characteristic.StatusLowBattery,
        Service.BatteryService,
        getStatusLowBattery
      )
      this.registerCharacteristic(
        Characteristic.ChargingState,
        Service.BatteryService,
        getBatteryChargingState
      )
    }
  }

  initSensorService(SensorService: HAP.Service) {
    const { Characteristic } = hap

    this.registerCharacteristic(
      Characteristic.StatusTampered,
      SensorService,
      data => {
        return data.tamperStatus === 'ok'
          ? Characteristic.StatusTampered.NOT_TAMPERED
          : Characteristic.StatusTampered.TAMPERED
      }
    )

    if (hasBatteryStatus(this.device.data)) {
      this.registerCharacteristic(
        Characteristic.StatusLowBattery,
        SensorService,
        data => getStatusLowBattery(data)
      )
    }
  }
}
