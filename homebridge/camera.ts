import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { RingCamera } from '../api'
import { BaseDataAccessory } from './base-data-accessory'
import { map, mapTo, switchMap } from 'rxjs/operators'
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

    if (!hap.CameraController) {
      const error =
        'HAP CameraController not found.  Please make sure you are on homebridge version 1.0.0 or newer'
      logger.error(error)
      throw new Error(error)
    }

    const { Characteristic, Service } = hap,
      { StatusLowBattery } = Characteristic,
      cameraSource = new CameraSource(device, logger)

    accessory.configureController(cameraSource.controller)

    this.registerCharacteristic({
      characteristicType: Characteristic.Mute,
      serviceType: Service.Microphone,
      getValue: () => false,
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.Mute,
      serviceType: Service.Speaker,
      getValue: () => false,
    })

    if (!config.hideCameraMotionSensor) {
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.MotionDetected,
        serviceType: Service.MotionSensor,
        onValue: device.onMotionDetected.pipe(
          switchMap(async (motion) => {
            if (!motion) {
              return false
            }

            if (device.hasBattery) {
              // battery cameras cannot fetch a new snapshot while recording is in progress
              this.logger.info(device.name + ' Detected Motion')
              return true
            }

            this.logger.info(
              device.name +
                ' Detected Motion. Loading snapshot before sending event to HomeKit'
            )

            try {
              await cameraSource.loadSnapshot()
            } catch (e) {
              this.logger.info(
                device.name +
                  ' Failed to load snapshot.  Sending motion to HomeKit without new snapshot'
              )
            }

            return true
          })
        ),
      })
    }

    if (device.isDoorbot) {
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: device.onDoorbellPressed.pipe(
          switchMap(async () => {
            if (device.hasBattery) {
              // battery cameras cannot fetch a new snapshot while recording is in progress
              this.logger.info(device.name + ' Button Pressed')
              return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
            }

            this.logger.info(
              device.name +
                ' Button Pressed. Loading snapshot before sending event to HomeKit'
            )

            try {
              await cameraSource.loadSnapshot()
            } catch (e) {
              this.logger.info(
                device.name +
                  ' Failed to load snapshot.  Sending motion to HomeKit without new snapshot'
              )
            }

            return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
          })
        ),
      })

      if (!config.hideDoorbellSwitch) {
        this.registerObservableCharacteristic({
          characteristicType: Characteristic.ProgrammableSwitchEvent,
          serviceType: Service.StatelessProgrammableSwitch,
          onValue: device.onDoorbellPressed.pipe(
            mapTo(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS)
          ),
        })

        // Hide long and double press events by setting max value
        this.getService(Service.StatelessProgrammableSwitch)
          .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
          .setProps({
            maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          })
      }
    } else if (config.sendCameraMotionNotificationsToTV) {
      // allow standalone cameras to act as a doorbell press when motion is detected
      // this allows tvOS 14 notifications to show camera motion alerts
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: device.onMotionStart.pipe(
          switchMap(async (motion) => {
            if (!motion) {
              return false
            }

            if (device.hasBattery) {
              // battery cameras cannot fetch a new snapshot while recording is in progress
              this.logger.info(
                device.name + ' Motion Detected - simulate Doorbell'
              )
              return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
            }

            this.logger.info(
              device.name +
                ' Motion Detected - simulate Doorbell Pressed. Loading snapshot before sending event to HomeKit'
            )

            try {
              await cameraSource.loadSnapshot()
            } catch (e) {
              this.logger.info(
                device.name +
                  ' Failed to load snapshot. Sending motion to HomeKit doorbell without new snapshot'
              )
            }

            return Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
          })
        ),
      })

      // Hide long and double press events by setting max value
      this.getService(Service.StatelessProgrammableSwitch)
        .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
        .setProps({
          maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
        })
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
