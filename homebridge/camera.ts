import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { RingCamera, DoorbellType } from '../api'
import { BaseAccessory } from './base-accessory'
import { filter, map, mapTo } from 'rxjs/operators'
import { CameraSource } from './camera-source'

export class Camera extends BaseAccessory<RingCamera> {
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
      this.registerObservableCharacteristic(
        Characteristic.MotionDetected,
        Service.MotionSensor,
        device.onMotionDetected
      )

      device.onMotionDetected.pipe(filter(motion => motion)).subscribe(() => {
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

      this.registerObservableCharacteristic(
        Characteristic.ProgrammableSwitchEvent,
        Service.Doorbell,
        onPressed
      )

      if (!config.hideDoorbellSwitch) {
        this.registerObservableCharacteristic(
          Characteristic.ProgrammableSwitchEvent,
          Service.StatelessProgrammableSwitch,
          onPressed
        )
      }
    }

    if (device.hasLight) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Lightbulb,
        data => {
          return data.led_status === 'on'
        },
        value => device.setLight(value),
        0,
        undefined,
        () => device.requestUpdate()
      )
    }

    if (device.hasSiren && !config.hideCameraSirenSwitch) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Switch,
        data => {
          return Boolean(
            data.siren_status && data.siren_status.seconds_remaining
          )
        },
        value => device.setSiren(value),
        0,
        device.name + ' Siren',
        () => device.requestUpdate()
      )
    }

    if (
      device.existingDoorbellType !== undefined &&
      device.existingDoorbellType !== DoorbellType.None &&
      !config.hideExistingDoorbellSwitch
    ) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Switch,
        data => {
          return Boolean(
            data.settings &&
              data.settings.chime_settings &&
              data.settings.chime_settings.enable
          )
        },
        value => device.setExistingDoorbell(value),
        0,
        device.name + ' Existing Doorbell',
        () => device.requestUpdate()
      )
    }

    this.registerCharacteristic(
      Characteristic.Manufacturer,
      Service.AccessoryInformation,
      () => 'Ring'
    )
    this.registerCharacteristic(
      Characteristic.Model,
      Service.AccessoryInformation,
      data => `${device.model} (${data.kind})`
    )
    this.registerCharacteristic(
      Characteristic.SerialNumber,
      Service.AccessoryInformation,
      data => data.device_id
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

      this.registerObservableCharacteristic(
        Characteristic.BatteryLevel,
        Service.BatteryService,
        device.onBatteryLevel.pipe(
          map(batteryLevel => {
            return batteryLevel === null ? 100 : batteryLevel
          })
        )
      )
    }
  }
}
