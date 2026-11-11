import type { CharacteristicType, ServiceType } from './base-accessory.ts'
import { BaseAccessory } from './base-accessory.ts'
import type { Observable } from 'rxjs'
import { merge, Subject } from 'rxjs'
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
      { device } = this,
      onValue = new Subject<CharacteristicValue>()

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
          onValue.next(newValue)
          onValueToSet.next(newValue)
          callback()
        },
      )

      onValueToSet
        .pipe(debounceTime(setValueDebounceTime))
        .subscribe((value) => {
          Promise.resolve()
            .then(() => setValue(value))
            .catch(logError)
        })
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

    merge(
      (this.device.onData as Observable<T['data']>).pipe(map(getValue)),
      onValue,
    )
      .pipe(distinctUntilChanged())
      .subscribe((value) => characteristic.updateValue(value))

    return (value: CharacteristicValue) => onValue.next(value)
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
    let targetLevel: number | undefined,
      levelRequestId = 0

    const updateValue = this.registerCharacteristic({
      characteristicType,
      serviceType,
      getValue: (data) => {
        const newLevel = getValue(data)

        if (newLevel === targetLevel) {
          targetLevel = undefined
        }

        return targetLevel === undefined ? newLevel : targetLevel
      },
      setValue: async (level: number) => {
        const requestId = ++levelRequestId
        targetLevel = level

        try {
          await setValue(level)
        } catch (e) {
          if (requestId === levelRequestId) {
            targetLevel = undefined
            updateValue(getValue(this.device.data))
          }
          throw e
        }
      },
      setValueDebounceTime: 500,
      requestUpdate,
    })
  }
}
