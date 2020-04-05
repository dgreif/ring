import { BaseAccessory } from './base-accessory'
import { Observable, Subject } from 'rxjs'
import { RingCamera, RingDevice } from '../api'
import { HAP } from './hap'
import { RingPlatformConfig } from './config'
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators'
import Service = HAP.Service

export abstract class BaseDataAccessory<
  T extends RingDevice | RingCamera
> extends BaseAccessory<T> {
  abstract readonly device: T
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log
  abstract readonly config: RingPlatformConfig

  registerCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    getValue: (data: T['data']) => any,
    setValue?: (data: any) => any,
    setValueDebounceTime = 0,
    name?: string,
    requestUpdate?: () => any,
    serviceSubType?: string
  ) {
    const service = this.getService(serviceType, name, serviceSubType),
      characteristic = service.getCharacteristic(characteristicType),
      { device } = this

    characteristic.on('get', (callback) => {
      try {
        const value = getValue(device.data)
        callback(null, value)

        if (requestUpdate) {
          requestUpdate()
        }
      } catch (e) {
        callback(e)
      }
    })

    if (setValue && setValueDebounceTime) {
      const onValueToSet = new Subject<any>()

      characteristic.on('set', (newValue, callback) => {
        onValueToSet.next(newValue)
        callback()
      })

      onValueToSet.pipe(debounceTime(setValueDebounceTime)).subscribe(setValue)
    } else if (setValue) {
      characteristic.on('set', async (newValue, callback) => {
        try {
          await Promise.resolve(setValue(newValue))
          callback()
        } catch (e) {
          this.logger.error(e)
          callback(e)
        }
      })
    }

    ;(this.device.onData as Observable<T['data']>)
      .pipe(map(getValue), distinctUntilChanged())
      .subscribe((value) => characteristic.updateValue(value))
  }

  registerLevelCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    getValue: (data: T['data']) => number,
    setValue: (data: any) => any
  ) {
    let targetLevel: number | undefined

    this.registerCharacteristic(
      characteristicType,
      serviceType,
      (data) => {
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
}
