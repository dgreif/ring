import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { RingCamera } from '../api'
import { BaseDataAccessory } from './base-data-accessory'
import { filter, map, mapTo } from 'rxjs/operators'
import { CameraSource } from './camera-source'

export class Camera extends BaseDataAccessory<RingCamera> {
  private inHomeDoorbellStatus: boolean | undefined

  constructor(
    public readonly device: RingCamera,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()
    const { Characteristic, Service } = hap,
      { StatusLowBattery } = Characteristic,
      cameraSource = new CameraSource(device, logger)

    accessory.configureCameraSource(cameraSource)

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
      this.registerCharacteristic(
        Characteristic.On,
        Service.Lightbulb,
        (data) => {
          return data.led_status === 'on'
        },
        (value) => device.setLight(value),
        0,
        undefined,
        () => device.requestUpdate()
      )
    }

    if (device.hasSiren && !config.hideCameraSirenSwitch) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Switch,
        (data) => {
          return Boolean(
            data.siren_status && data.siren_status.seconds_remaining
          )
        },
        (value) => device.setSiren(value),
        0,
        device.name + ' Siren',
        () => device.requestUpdate(),
        'Siren'
      )
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
        onValue: device.onInHomeDoorbellStatus,
        setValue: (value) => device.setInHomeDoorbell(value),
        name: device.name + ' In-Home Doorbell',
        requestUpdate: () => device.requestUpdate(),
      })
    }

    this.registerCharacteristic(
      Characteristic.Manufacturer,
      Service.AccessoryInformation,
      () => 'Ring'
    )
    this.registerCharacteristic(
      Characteristic.Model,
      Service.AccessoryInformation,
      (data) => `${device.model} (${data.kind})`
    )
    this.registerCharacteristic(
      Characteristic.SerialNumber,
      Service.AccessoryInformation,
      (data) => data.device_id
    )

    if (
      device.hasBattery ||
      (device.batteryLevel !== null && device.batteryLevel < 100) ||
      accessory.getService(Service.BatteryService)
    ) {
      this.registerCharacteristic(
        Characteristic.StatusLowBattery,
        Service.BatteryService,
        () => {
          return device.hasLowBattery
            ? StatusLowBattery.BATTERY_LEVEL_LOW
            : StatusLowBattery.BATTERY_LEVEL_NORMAL
        }
      )

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
