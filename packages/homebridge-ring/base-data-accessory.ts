import type { CharacteristicType, ServiceType } from './base-accessory.ts'
import { BaseAccessory } from './base-accessory.ts'
import type { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import type {
  RingCamera,
  RingChime,
  RingDevice,
  RingIntercom,
} from 'ring-client-api'
import type { RingPlatformConfig } from './config.ts'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import type {
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge'
import { CharacteristicEventTypes } from 'homebridge'
import { logError } from 'ring-client-api/util'

export abstract class BaseDataAccessory<
  T extends RingDevice | RingCamera | RingChime | RingIntercom,
> extends BaseAccessory<T> {
  abstract readonly device: T
  abstract readonly accessory: PlatformAccessory
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
        },
      )
    }

    if (setValue && setValueDebounceTime) {
      const onValueToSet = new Subject<any>()

      characteristic.on(
        CharacteristicEventTypes.SET,
        (
          newValue: CharacteristicValue,
          callback: CharacteristicSetCallback,
        ) => {
          onValueToSet.next(newValue)
          callback()
        },
      )

      onValueToSet.pipe(debounceTime(setValueDebounceTime)).subscribe(setValue)
    } else if (setValue) {
      characteristic.on(
        CharacteristicEventTypes.SET,
        (
          newValue: CharacteristicValue,
          callback: CharacteristicSetCallback,
        ) => {
          Promise.resolve(setValue(newValue)).catch(logError)
          callback()
        },
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
      setValue: (level: number) => {
        targetLevel = level
        setValue(level)
      },
      setValueDebounceTime: 500,
      requestUpdate,
    })
  }
}
