import { HAP, hap } from './hap'
import Service = HAP.Service
import { take } from 'rxjs/operators'
import { Observable } from 'rxjs'
import { RingPlatformConfig } from './config'

export abstract class BaseAccessory<T extends { name: string }> {
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

    const debug = process.env.RING_DEBUG === 'true'

    if (debug) {
      name = 'TEST ' + name
    }

    const existingService = subType
        ? this.accessory.getServiceByUUIDAndSubType(serviceType, subType)
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

  registerObservableCharacteristic<T extends string | number | boolean>({
    characteristicType,
    serviceType,
    serviceSubType,
    onValue,
    setValue,
    name,
    requestUpdate,
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

    characteristic.on('get', async (callback) => {
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

    onValue.subscribe((value) => {
      characteristic.updateValue(value)
    })

    if (setValue) {
      characteristic.on('set', (newValue, callback) => {
        Promise.resolve(setValue(newValue)).catch((e) => {
          this.logger.error(e)
        })
        callback()
      })
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
          service.displayName
        )

        this.accessory.removeService(service)
      }
    })
  }
}
