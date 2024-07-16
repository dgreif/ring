import { RingIntercom } from 'ring-client-api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { PlatformAccessory } from 'homebridge'
import { BaseDataAccessory } from './base-data-accessory'
import { logError, logInfo } from 'ring-client-api/util'
import { map, throttleTime } from 'rxjs/operators'

export class Intercom extends BaseDataAccessory<RingIntercom> {
  private unlocking = false
  private unlockTimeout?: ReturnType<typeof setTimeout>

  constructor(
    public readonly device: RingIntercom,
    public readonly accessory: PlatformAccessory,
    public readonly config: RingPlatformConfig,
  ) {
    super()
    const { Characteristic, Service } = hap,
      lockService = this.getService(Service.LockMechanism),
      { LockCurrentState, LockTargetState, ProgrammableSwitchEvent } =
        Characteristic,
      programableSwitchService = this.getService(
        Service.StatelessProgrammableSwitch,
      ),
      onDoorbellPressed = device.onDing.pipe(
        throttleTime(15000),
        map(() => ProgrammableSwitchEvent.SINGLE_PRESS),
      ),
      syncLockState = () => {
        const state = this.getLockState()
        lockService
          .getCharacteristic(Characteristic.LockCurrentState)
          .updateValue(state)
        lockService
          .getCharacteristic(Characteristic.LockTargetState)
          .updateValue(state)
      },
      markAsUnlocked = () => {
        // Mark the lock as unlocked, wait 5 seconds, then mark it as locked again
        clearTimeout(this.unlockTimeout)
        this.unlocking = true

        // Update current state to reflect that the lock is unlocked
        syncLockState()

        // Leave the door in an "unlocked" state for 5 seconds
        // After that, set the lock back to "locked" for both current and target state
        this.unlockTimeout = setTimeout(() => {
          this.unlocking = false
          syncLockState()
        }, 5000)
      }

    // Subscribe to unlock events coming from push notifications, which will catch an unlock from the Ring app
    device.onUnlocked.subscribe(markAsUnlocked)

    // Lock Service
    this.registerCharacteristic({
      characteristicType: LockCurrentState,
      serviceType: lockService,
      getValue: () => this.getLockState(),
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: LockTargetState,
      serviceType: lockService,
      getValue: () => this.getLockState(),
      setValue: async (state: number) => {
        clearTimeout(this.unlockTimeout)

        if (state === LockTargetState.UNSECURED) {
          logInfo(`Unlocking ${device.name}`)
          this.unlocking = true

          const response = await device.unlock().catch((e) => {
            logError(e)
            this.unlocking = false
          })
          logInfo(`Unlock response: ${JSON.stringify(response)}`)

          markAsUnlocked()
        } else {
          // If the user locks the door from the home app, we can't do anything but set the states back to "locked"
          this.unlocking = false
          lockService
            .getCharacteristic(Characteristic.LockCurrentState)
            .updateValue(this.getLockState())
        }
      },
    })
    lockService.setPrimaryService(true)

    // Doorbell Service
    this.registerObservableCharacteristic({
      characteristicType: ProgrammableSwitchEvent,
      serviceType: Service.Doorbell,
      onValue: onDoorbellPressed,
    })

    // Programmable Switch Service
    this.registerObservableCharacteristic({
      characteristicType: ProgrammableSwitchEvent,
      serviceType: programableSwitchService,
      onValue: onDoorbellPressed,
    })

    // Hide long and double press events by setting max value
    programableSwitchService
      .getCharacteristic(ProgrammableSwitchEvent)
      .setProps({
        maxValue: ProgrammableSwitchEvent.SINGLE_PRESS,
      })

    // Battery Service
    if (device.batteryLevel !== null) {
      this.registerObservableCharacteristic({
        characteristicType: Characteristic.BatteryLevel,
        serviceType: Service.Battery,
        onValue: device.onBatteryLevel.pipe(
          map((batteryLevel) => {
            return batteryLevel === null ? 100 : batteryLevel
          }),
        ),
        requestUpdate: () => device.requestUpdate(),
      })
    }

    // Accessory Information Service
    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Intercom Handset Audio',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.device_id || 'Unknown',
    })
  }

  private getLockState() {
    const {
      Characteristic: { LockCurrentState: State },
    } = hap
    return this.unlocking ? State.UNSECURED : State.SECURED
  }
}
