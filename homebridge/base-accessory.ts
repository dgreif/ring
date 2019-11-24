import { RingCamera, RingDevice } from '../api'
import { HAP, hap } from './hap'
import Service = HAP.Service
import { debounceTime, distinctUntilChanged, map, take } from 'rxjs/operators'
import { Observable, Subject } from 'rxjs'
import { RingPlatformConfig } from './config'

export abstract class BaseAccessory<T extends RingDevice | RingCamera> {
  abstract readonly device: T
  abstract readonly accessory: HAP.Accessory
  abstract readonly logger: HAP.Log
  abstract readonly config: RingPlatformConfig
  private servicesInUse: Service[] = []

  initBase() {
    this.pruneUnusedServices()
  }

  getService(
    serviceType: HAP.Service,
    name = this.device.name,
    subType?: string
  ) {
    if (typeof (serviceType as any) === 'object') {
      return serviceType
    }

    if (process.env.RING_DEBUG) {
      name = 'TEST ' + name
    }

    const existingService = subType
        ? this.accessory.getServiceByUUIDAndSubType(serviceType, subType)
        : this.accessory.getService(serviceType),
      service =
        existingService || this.accessory.addService(serviceType, name, subType)

    if (
      existingService &&
      existingService.displayName &&
      name !== existingService.displayName
    ) {
      throw new Error(
        `Overlapping services for device ${this.device.name} - ${name} != ${existingService.displayName} - ${serviceType}`
      )
    }

    if (!this.servicesInUse.includes(service)) {
      this.servicesInUse.push(service)
    }

    return service
  }

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
      .pipe(map(getValue), distinctUntilChanged())
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

  registerObservableCharacteristic<T extends string | number | boolean>({
    characteristicType,
    serviceType,
    serviceSubType,
    onValue,
    setValue,
    name,
    requestUpdate
  }: {
    characteristicType: HAP.Characteristic
    serviceType: Service
    serviceSubType?: string
    onValue: Observable<T>
    setValue?: (value: T) => any
    name?: string
    requestUpdate?: () => any
  }) {
    const service = this.getService(serviceType, name, serviceSubType),
      characteristic = service.getCharacteristic(characteristicType)

    characteristic.on('get', async callback => {
      try {
        const value = await onValue.pipe(take(1)).toPromise()
        callback(null, value)

        if (requestUpdate) {
          requestUpdate()
        }
      } catch (e) {
        callback(e)
      }
    })

    onValue.subscribe(value => {
      characteristic.updateValue(value)
    })

    if (setValue) {
      characteristic.on('set', (newValue, callback) => {
        Promise.resolve(setValue(newValue)).catch(e => {
          this.logger.error(e)
        })
        callback()
      })
    }
  }

  pruneUnusedServices() {
    const safeServiceUUIDs = [
      hap.Service.CameraRTPStreamManagement.UUID,
      hap.Service.CameraControl.UUID
    ]

    this.accessory.services.forEach(service => {
      if (
        !this.servicesInUse.includes(service) &&
        !safeServiceUUIDs.includes(service.UUID)
      ) {
        this.logger.info(
          'Pruning unused service',
          service.UUID,
          service.displayName
        )

        this.accessory.removeService(service)
      }
    })
  }
}
