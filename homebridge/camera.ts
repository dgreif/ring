import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { RingCamera } from '../api'
import { BaseDataAccessory } from './base-data-accessory'
import { filter, map, mapTo } from 'rxjs/operators'
import { CameraSource } from './camera-source'
import { Logging, PlatformAccessory } from 'homebridge'

export class Camera extends BaseDataAccessory<RingCamera> {
  private inHomeDoorbellStatus: boolean | undefined

  constructor(
    public readonly device: RingCamera,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()
    const { Characteristic, Service } = hap,
      { StatusLowBattery } = Characteristic,
      cameraSource = new CameraSource(device, logger)

    accessory.configureController(cameraSource.controller)

    if (!config.hideCameraMotionSensor) {
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.MotionDetected,
        serviceType: Service.MotionSensor,
        onValue: device.onMotionDetected,
      })

      device.onMotionDetected.pipe(filter((motion) => motion)).subscribe(() => {
        this.logger.info(device.name + ' Detected Motion')
      })
    }

    if (device.isDoorbot) {
      const onPressed = device.onDoorbellPressed.pipe(
        mapTo(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS)
      )

      onPressed.subscribe(() => {
        this.logger.info(device.name + ' Button Pressed')
      })

      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: onPressed,
      })

      if (!config.hideDoorbellSwitch) {
        this.registerObservableCharacteristic({
          characteristicType: Characteristic.ProgrammableSwitchEvent,
          serviceType: Service.StatelessProgrammableSwitch,
          onValue: onPressed,
        })
      }
    }

    if (device.hasLight) {
      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Lightbulb,
        getValue: (data) => data.led_status === 'on',
        setValue: (value) => device.setLight(value),
        requestUpdate: () => device.requestUpdate(),
      })
    }

    if (device.hasSiren && !config.hideCameraSirenSwitch) {
      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Switch,
        serviceSubType: 'Siren',
        name: device.name + ' Siren',
        getValue: (data) => {
          return Boolean(
            data.siren_status && data.siren_status.seconds_remaining
          )
        },
        setValue: (value) => device.setSiren(value),
        requestUpdate: () => device.requestUpdate(),
      })
    }

    if (device.hasInHomeDoorbell && !config.hideInHomeDoorbellSwitch) {
      this.device.onInHomeDoorbellStatus.subscribe(
        (data: boolean | undefined) => {
          this.inHomeDoorbellStatus = data
        }
      )
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Switch,
        serviceSubType: 'In-Home Doorbell',
        name: device.name + ' In-Home Doorbell',
        onValue: device.onInHomeDoorbellStatus,
        setValue: (value) => device.setInHomeDoorbell(value),
        requestUpdate: () => device.requestUpdate(),
      })
    }

    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => `${device.model} (${data.kind})`,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.device_id,
    })

    if (
      device.hasBattery ||
      (device.batteryLevel !== null && device.batteryLevel < 100) ||
      accessory.getService(Service.BatteryService)
    ) {
      this.registerCharacteristic({
        characteristicType: Characteristic.StatusLowBattery,
        serviceType: Service.BatteryService,
        getValue: () => {
          return device.hasLowBattery
            ? StatusLowBattery.BATTERY_LEVEL_LOW
            : StatusLowBattery.BATTERY_LEVEL_NORMAL
        },
      })

      this.registerObservableCharacteristic({
        characteristicType: Characteristic.BatteryLevel,
        serviceType: Service.BatteryService,
        onValue: device.onBatteryLevel.pipe(
          map((batteryLevel) => {
            return batteryLevel === null ? 100 : batteryLevel
          })
        ),
      })
    }
  }
}
