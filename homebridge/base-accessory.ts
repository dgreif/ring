import { RingDevice, RingDeviceData } from '../api'
import { HAP, hap } from './hap'
import Service = HAP.Service
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import { Subject } from 'rxjs'
import { RingAlarmPlatformConfig } from './config'

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

export abstract class BaseAccessory {
  abstract readonly device: RingDevice
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log
  abstract readonly config: RingAlarmPlatformConfig

  protected constructor() {
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
      data => data.manufacturerName || 'ring'
    )
    this.registerCharacteristic(
      Characteristic.Model,
      Service.AccessoryInformation,
      data => data.deviceType
    )
    this.registerCharacteristic(
      Characteristic.SerialNumber,
      Service.AccessoryInformation,
      data => data.serialNumber || 'unknown'
    )

    if (initialData.volume !== undefined) {
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

  getService(serviceType: HAP.Service) {
    const { name } = this.device.data
    return (
      this.accessory.getService(serviceType, name) ||
      this.accessory.addService(serviceType, name)
    )
  }

  registerCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    getValue: (data: RingDeviceData) => any,
    setValue?: (data: any) => any,
    setValueDebounceTime = 0
  ) {
    const service = this.getService(serviceType),
      characteristic = service.getCharacteristic(characteristicType)

    characteristic.on('get', callback => {
      try {
        const value = getValue(this.device.data)
        callback(null, value)
      } catch (e) {
        callback(e)
      }
    })

    if (setValue) {
      const onValueToSet = new Subject<any>()

      characteristic.on('set', async (newValue, callback) => {
        onValueToSet.next(newValue)
        callback()
      })

      onValueToSet.pipe(debounceTime(setValueDebounceTime)).subscribe(setValue)
    }

    this.device.onData
      .pipe(
        map(getValue),
        distinctUntilChanged()
      )
      .subscribe(value => characteristic.updateValue(value))
  }

  registerLevelCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    getValue: (data: RingDeviceData) => number,
    setValue: (data: any) => any
  ) {
    let targetLevel: number | undefined

    this.registerCharacteristic(
      characteristicType,
      serviceType,
      data => {
        const newLevel = getValue(data)

        if (newLevel === targetLevel) {
          targetLevel = undefined
        }

        return targetLevel === undefined ? newLevel : targetLevel
      },
      (volume: number) => {
        targetLevel = volume
        setValue(volume)
      },
      500
    )
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
