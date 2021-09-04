import {
  BaseAccessory,
  CharacteristicType,
  ServiceType,
} from './base-accessory'
import { Observable, Subject } from 'rxjs'
import { RingCamera, RingChime, RingDevice } from '../api'
import { RingPlatformConfig } from './config'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import {
  Logging,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
  CharacteristicEventTypes,
} from 'homebridge'

export abstract class BaseDataAccessory<
  T extends RingDevice | RingCamera | RingChime
> extends BaseAccessory<T> {
  abstract readonly device: T
  abstract readonly accessory: PlatformAccessory
  abstract readonly logger: Logging
  abstract readonly config: RingPlatformConfig

  registerCharacteristic({
    characteristicType,
    serviceType,
    getValue,
    setValue,
    setValueDebounceTime = 0,
    name,
    requestUpdate,
    serviceSubType,
  }: {
    characteristicType: CharacteristicType
    serviceType: ServiceType
    serviceSubType?: string
    name?: string
    getValue: (data: T['data']) => any
    setValue?: (data: any) => any
    setValueDebounceTime?: number
    requestUpdate?: () => any
  }) {
    const service = this.getService(serviceType, name, serviceSubType),
      characteristic = service.getCharacteristic(characteristicType),
      { device } = this

    if (requestUpdate) {
      // Only register for GET if an async request should be made to get an updated value
      characteristic.on(
        CharacteristicEventTypes.GET,
        (callback: CharacteristicGetCallback) => {
          try {
            const value = getValue(device.data)
            callback(null, value)
            requestUpdate()
          } catch (e: any) {
            callback(e)
          }
        }
      )
    }

    if (setValue && setValueDebounceTime) {
      const onValueToSet = new Subject<any>()

      characteristic.on(
        CharacteristicEventTypes.SET,
        (
          newValue: CharacteristicValue,
          callback: CharacteristicSetCallback
        ) => {
          onValueToSet.next(newValue)
          callback()
        }
      )

      onValueToSet.pipe(debounceTime(setValueDebounceTime)).subscribe(setValue)
    } else if (setValue) {
      characteristic.on(
        CharacteristicEventTypes.SET,
        (
          newValue: CharacteristicValue,
          callback: CharacteristicSetCallback
        ) => {
          Promise.resolve(setValue(newValue)).catch((e) => {
            this.logger.error(e)
          })
          callback()
        }
      )
    }

    ;(this.device.onData as Observable<T['data']>)
      .pipe(map(getValue), distinctUntilChanged())
      .subscribe((value) => characteristic.updateValue(value))
  }

  registerLevelCharacteristic({
    characteristicType,
    serviceType,
    getValue,
    setValue,
    requestUpdate,
  }: {
    characteristicType: CharacteristicType
    serviceType: ServiceType
    getValue: (data: T['data']) => number
    setValue: (data: any) => any
    requestUpdate?: () => any
  }) {
    let targetLevel: number | undefined

    this.registerCharacteristic({
      characteristicType,
      serviceType,
      getValue: (data) => {
        const newLevel = getValue(data)

        if (newLevel === targetLevel) {
          targetLevel = undefined
        }

        return targetLevel === undefined ? newLevel : targetLevel
      },
      setValue: (volume: number) => {
        targetLevel = volume
        setValue(volume)
      },
      setValueDebounceTime: 500,
      requestUpdate,
    })
  }
}
