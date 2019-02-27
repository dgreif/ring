import { AlarmDevice, AlarmDeviceData } from '../api'
import { HAP, hap } from './hap'
import Service = HAP.Service
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import { Subject } from 'rxjs'

function getBatteryLevel({ batteryLevel, batteryStatus }: AlarmDeviceData) {
  if (batteryLevel !== undefined) {
    return batteryLevel
  } else if (batteryStatus === 'full') {
    return 100
  } else if (batteryStatus === 'ok') {
    return 50
  }
  return 0
}

function getStatusLowBattery(data: AlarmDeviceData) {
  const { StatusLowBattery } = hap.Characteristic,
    batteryLevel = getBatteryLevel(data)

  return batteryLevel > 20
    ? StatusLowBattery.BATTERY_LEVEL_NORMAL
    : StatusLowBattery.BATTERY_LEVEL_LOW
}

function getBatteryChargingState({
  batteryStatus,
  batteryBackup
}: AlarmDeviceData) {
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

export abstract class BaseAccessory {
  abstract readonly device: AlarmDevice
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log

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
      let targetVolume: number | undefined

      this.registerCharacteristic(
        Characteristic.Mute,
        Service.Speaker,
        () => false
      )
      this.registerCharacteristic(
        Characteristic.Volume,
        Service.Speaker,
        data => {
          if (data.volume === undefined) {
            return 0
          }

          const newVolume = data.volume * 100

          if (newVolume === targetVolume) {
            targetVolume = undefined
          }

          return targetVolume === undefined ? newVolume : targetVolume
        },
        (volume: number) => {
          targetVolume = volume
          device.setVolume(volume / 100)
        },
        500
      )
    }

    if (initialData.batteryStatus !== 'none') {
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
    getValue: (data: AlarmDeviceData) => any,
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
    this.registerCharacteristic(
      Characteristic.StatusLowBattery,
      SensorService,
      data => getStatusLowBattery(data)
    )
  }
}
