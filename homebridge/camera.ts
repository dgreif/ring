import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { RingCamera } from '../api'
import { BaseDataAccessory } from './base-data-accessory'
import { map, mapTo, switchMap } from 'rxjs/operators'
import { CameraSource } from './camera-source'
import { Logging, PlatformAccessory } from 'homebridge'
import { merge } from 'rxjs'
import { TargetValueTimer } from './target-value-timer'

export class Camera extends BaseDataAccessory<RingCamera> {
  private inHomeDoorbellStatus: boolean | undefined
  private cameraSource = new CameraSource(this.device)

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
      { ChargingState, StatusLowBattery } = Characteristic

    accessory.configureController(this.cameraSource.controller)

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
          switchMap((motion) => {
            if (!motion) {
              return Promise.resolve(false)
            }

            return this.loadSnapshotForEvent('Detected Motion', true)
          })
        ),
      })
    }

    if (device.isDoorbot) {
      const onDoorbellPressed = device.onDoorbellPressed.pipe(
          mapTo('Doorbell Pressed')
        ),
        onEventDescription = config.sendDoorbellMotionNotificationsToTv
          ? merge(
              onDoorbellPressed,
              device.onMotionStarted.pipe(
                mapTo('Motion Detected - Simulating Doorbell Press')
              )
            )
          : onDoorbellPressed

      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: onEventDescription.pipe(
          switchMap((eventDescription) => {
            return this.loadSnapshotForEvent(
              eventDescription,
              Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
            )
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
    } else if (config.sendCameraMotionNotificationsToTv) {
      // allow standalone cameras to act as a doorbell press when motion is detected
      // this allows tvOS 14 notifications to show camera motion alerts
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: device.onMotionStarted.pipe(
          switchMap(() => {
            return this.loadSnapshotForEvent(
              'Motion Detected - Simulating Doorbell Press',
              Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
            )
          })
        ),
      })
    }

    if (device.hasLight && !config.hideCameraLight) {
      const lightTargetTimer = new TargetValueTimer<boolean>()
      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Lightbulb,
        getValue: (data) => {
          const value = lightTargetTimer.hasTarget()
            ? lightTargetTimer.getTarget()
            : data.led_status === 'on'

          return value
        },
        setValue: (value: boolean) => {
          // Allow 5 seconds for the light value to update in our status updates from Ring
          lightTargetTimer.setTarget(value, 5000)
          return device.setLight(value)
        },
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
      // detected as having battery in the past
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

      this.registerCharacteristic({
        characteristicType: Characteristic.ChargingState,
        serviceType: Service.BatteryService,
        getValue: (data) => {
          return data.external_connection
            ? ChargingState.CHARGING
            : ChargingState.NOT_CHARGING
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

  private async loadSnapshotForEvent<T>(
    eventDescription: string,
    characteristicValue: T
  ) {
    if (this.device.operatingOnBattery) {
      // battery cameras cannot fetch a new snapshot while recording is in progress
      this.logger.info(this.device.name + ' ' + eventDescription)
      return characteristicValue
    }

    this.logger.info(
      this.device.name +
        ` ${eventDescription}. Loading snapshot before sending event to HomeKit`
    )

    try {
      await this.cameraSource.loadSnapshot()
    } catch (e) {
      this.logger.info(
        this.device.name +
          ' Failed to load snapshot.  Sending event to HomeKit without new snapshot'
      )
    }

    return characteristicValue
  }
}
