import { hap } from './hap'
import { publishReplay, refCount, take } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { RingPlatformConfig } from './config'
import {
  Characteristic,
  Logging,
  PlatformAccessory,
  Service,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicValue,
  CharacteristicSetCallback,
  WithUUID,
} from 'homebridge'

function isServiceInstance(
  serviceType: WithUUID<typeof Service> | Service
): serviceType is Service {
  return typeof (serviceType as any) === 'object'
}

export type CharacteristicType = WithUUID<{ new (): Characteristic }>
export type ServiceType = WithUUID<typeof Service> | Service

export abstract class BaseAccessory<T extends { name: string }> {
  abstract readonly device: T
  abstract readonly accessory: PlatformAccessory
  abstract readonly logger: Logging
  abstract readonly config: RingPlatformConfig
  private servicesInUse: Service[] = []

  initBase() {
    this.pruneUnusedServices()
  }

  getService(
    serviceType: ServiceType,
    name = this.device.name,
    subType?: string
  ) {
    if (isServiceInstance(serviceType)) {
      return serviceType
    }

    const debug = process.env.RING_DEBUG === 'true'

    if (debug) {
      name = 'TEST ' + name
    }

    const existingService = subType
        ? this.accessory.getServiceById(serviceType, subType)
        : this.accessory.getService(serviceType),
      service =
        existingService || this.accessory.addService(serviceType, name, subType)

    if (
      debug &&
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

  registerObservableCharacteristic<U extends CharacteristicValue>({
    characteristicType,
    serviceType,
    serviceSubType,
    onValue,
    setValue,
    name,
    requestUpdate,
  }: {
    characteristicType: CharacteristicType
    serviceType: ServiceType
    serviceSubType?: string
    onValue: Observable<U>
    setValue?: (value: U) => any
    name?: string
    requestUpdate?: () => any
  }) {
    const service = this.getService(serviceType, name, serviceSubType),
      characteristic = service.getCharacteristic(characteristicType),
      onCachedValue = onValue.pipe(publishReplay(1), refCount())

    onCachedValue.subscribe((value) => {
      characteristic.updateValue(value)
    })

    if (requestUpdate) {
      // Only register for GET if an async request should be made to get an updated value
      onCachedValue.pipe(take(1)).subscribe(() => {
        // allow GET once a value is cached
        characteristic.on(
          CharacteristicEventTypes.GET,
          async (callback: CharacteristicGetCallback) => {
            try {
              const value = await onCachedValue.pipe(take(1)).toPromise()
              callback(null, value)
              requestUpdate()
            } catch (e) {
              callback(e)
            }
          }
        )
      })
    }

    if (setValue) {
      characteristic.on(
        CharacteristicEventTypes.SET,
        (
          newValue: CharacteristicValue,
          callback: CharacteristicSetCallback
        ) => {
          Promise.resolve(setValue(newValue as U)).catch((e) => {
            this.logger.error(e)
          })
          callback()
        }
      )
    }
  }

  pruneUnusedServices() {
    const safeServiceUUIDs = [
      hap.Service.CameraRTPStreamManagement.UUID,
      hap.Service.CameraControl.UUID,
    ]

    this.accessory.services.forEach((service) => {
      if (
        !this.servicesInUse.includes(service) &&
        !safeServiceUUIDs.includes(service.UUID)
      ) {
        this.logger.info(
          'Pruning unused service',
          service.UUID,
          service.displayName || service.name,
          'from',
          this.device.name
        )

        this.accessory.removeService(service)
      }
    })
  }
}
