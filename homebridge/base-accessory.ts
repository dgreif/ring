import { RingCamera, RingDevice } from '../api'
import { HAP } from './hap'
import Service = HAP.Service
import { debounceTime, distinctUntilChanged, map, take } from 'rxjs/operators'
import { Observable, Subject } from 'rxjs'
import { RingPlatformConfig } from './config'

export abstract class BaseAccessory<T extends RingDevice | RingCamera> {
  abstract readonly device: T
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log
  abstract readonly config: RingPlatformConfig

  getService(serviceType: HAP.Service, name = this.device.name) {
    if (process.env.RING_DEBUG) {
      name = 'TEST ' + name
    }

    return (
      this.accessory.getService(serviceType) ||
      this.accessory.addService(serviceType, name)
    )
  }

  registerCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    getValue: (data: T['data']) => any,
    setValue?: (data: any) => any,
    setValueDebounceTime = 0,
    name?: string,
    requestUpdate?: () => any
  ) {
    const service = this.getService(serviceType, name),
      characteristic = service.getCharacteristic(characteristicType),
      { device } = this

    characteristic.on('get', callback => {
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
      .pipe(
        map(getValue),
        distinctUntilChanged()
      )
      .subscribe(value => characteristic.updateValue(value))
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

  registerObservableCharacteristic(
    characteristicType: HAP.Characteristic,
    serviceType: Service,
    onValue: Observable<any>,
    name?: string
  ) {
    const service = this.getService(serviceType, name),
      characteristic = service.getCharacteristic(characteristicType)

    characteristic.on('get', async callback => {
      try {
        const value = await onValue.pipe(take(1)).toPromise()
        callback(null, value)
      } catch (e) {
        callback(e)
      }
    })

    onValue.subscribe(value => {
      characteristic.updateValue(value)
    })
  }

  removeService(service: Service) {
    const existingService = this.accessory.getService(service)

    if (existingService) {
      this.accessory.removeService(existingService)
    }
  }
}
