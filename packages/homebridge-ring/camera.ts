import { hap } from './hap'
import { RingPlatformConfig } from './config'
import type { RingCamera } from 'ring-client-api'
import { BaseDataAccessory } from './base-data-accessory'
import { filter, map, mapTo, switchMap, throttleTime } from 'rxjs/operators'
import { CameraSource } from './camera-source'
import { PlatformAccessory } from 'homebridge'
import { TargetValueTimer } from './target-value-timer'
import { delay, logError, logInfo } from 'ring-client-api/util'
import { firstValueFrom } from 'rxjs'

export class Camera extends BaseDataAccessory<RingCamera> {
  private inHomeDoorbellStatus: boolean | undefined
  private cameraSource = new CameraSource(
    this.device,
    this.config.unbridgeCameras,
  )

  constructor(
    public readonly device: RingCamera,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()

    if (!hap.CameraController) {
      const error =
        'HAP CameraController not found.  Please make sure you are on homebridge version 1.0.0 or newer'
      logError(error)
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
          }),
        ),
      })
    }

    if (device.isDoorbot) {
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.ProgrammableSwitchEvent,
        serviceType: Service.Doorbell,
        onValue: device.onDoorbellPressed.pipe(
          throttleTime(15000),
          switchMap(() => {
            return this.loadSnapshotForEvent(
              'Doorbell Pressed',
              Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
            )
          }),
        ),
      })

      if (!config.hideDoorbellSwitch) {
        this.registerObservableCharacteristic({
          characteristicType: Characteristic.ProgrammableSwitchEvent,
          serviceType: Service.StatelessProgrammableSwitch,
          onValue: device.onDoorbellPressed.pipe(
            mapTo(Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS),
          ),
        })

        // Hide long and double press events by setting max value
        this.getService(Service.StatelessProgrammableSwitch)
          .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
          .setProps({
            maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
          })
      }
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
          // Allow 30 seconds for the light value to update in our status updates from Ring
          lightTargetTimer.setTarget(value, 30000)
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
            data.siren_status && data.siren_status.seconds_remaining,
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
        },
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
      getValue: (data) => {
        if ('metadata' in data && 'third_party_manufacturer' in data.metadata) {
          return data.metadata.third_party_manufacturer
        }
        return 'Ring'
      },
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => {
        if ('metadata' in data && 'third_party_model' in data.metadata) {
          return data.metadata.third_party_model
        }
        return `${device.model} (${data.kind})`
      },
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.device_id,
    })

    if (device.hasBattery) {
      this.registerCharacteristic({
        characteristicType: Characteristic.StatusLowBattery,
        serviceType: Service.Battery,
        getValue: () => {
          return device.hasLowBattery
            ? StatusLowBattery.BATTERY_LEVEL_LOW
            : StatusLowBattery.BATTERY_LEVEL_NORMAL
        },
      })

      this.registerCharacteristic({
        characteristicType: Characteristic.ChargingState,
        serviceType: Service.Battery,
        getValue: () => {
          return device.isCharging
            ? ChargingState.CHARGING
            : ChargingState.NOT_CHARGING
        },
      })

      this.registerObservableCharacteristic({
        characteristicType: Characteristic.BatteryLevel,
        serviceType: Service.Battery,
        onValue: device.onBatteryLevel.pipe(
          map((batteryLevel) => {
            return batteryLevel === null ? 100 : batteryLevel
          }),
        ),
      })
    }
  }

  private async loadSnapshotForEvent<T>(
    eventDescription: string,
    characteristicValue: T,
  ) {
    let imageUuid = this.device.latestNotificationSnapshotUuid

    /**
     * Battery cameras may receive an initial notification with no image uuid,
     * followed shortly by a second notification with the image uuid. We need to
     * wait for the second notification before we can load the snapshot.
     */
    if (this.device.operatingOnBattery && !imageUuid) {
      await Promise.race([
        firstValueFrom(
          this.device.onNewNotification.pipe(
            filter((notification) => Boolean(notification.img?.snapshot_uuid)),
          ),
        ),
        // wait up to 2 seconds for the second notification
        delay(2000),
      ])
      imageUuid = this.device.latestNotificationSnapshotUuid
    }

    if (this.device.operatingOnBattery && !imageUuid) {
      // battery cameras cannot fetch a new snapshot while recording is in progress
      logInfo(this.device.name + ' ' + eventDescription)
      return characteristicValue
    }

    logInfo(
      this.device.name +
        ` ${eventDescription}. Loading snapshot before sending event to HomeKit`,
    )

    try {
      await this.cameraSource.loadSnapshot(imageUuid)
    } catch (e) {
      logInfo(
        this.device.name +
          ' Failed to load snapshot.  Sending event to HomeKit without new snapshot',
      )
    }

    return characteristicValue
  }
}
