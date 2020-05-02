import { BaseDeviceAccessory } from './base-device-accessory'
import { RingDevice, RingDeviceData, AlarmState, allAlarmStates } from '../api'
import { distinctUntilChanged } from 'rxjs/operators'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'

export class SecurityPanel extends BaseDeviceAccessory {
  private targetState: any
  private alarmStates: AlarmState[] = this.config.alarmOnEntryDelay
    ? allAlarmStates
    : allAlarmStates.filter((x) => x !== 'entry-delay')

  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap

    this.device.onData
      .pipe(distinctUntilChanged((a, b) => a.mode === b.mode))
      .subscribe((data) => {
        this.targetState = this.getTargetState(data)
      })

    this.registerCharacteristic({
      characteristicType: Characteristic.SecuritySystemCurrentState,
      serviceType: Service.SecuritySystem,
      getValue: (data) => {
        const state = this.getCurrentState(data)

        if (state === this.targetState) {
          this.targetState = undefined
        }

        return state
      },
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.SecuritySystemTargetState,
      serviceType: Service.SecuritySystem,
      getValue: (data) => this.getTargetState(data),
      setValue: (value) => this.setTargetState(value),
    })

    if (!config.hideAlarmSirenSwitch) {
      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Switch,
        name: this.device.name + ' Siren',
        getValue: (data) => data.siren && data.siren.state === 'on',
        setValue: (value) => {
          if (value) {
            return this.device.location.soundSiren()
          }
          return this.device.location.silenceSiren()
        },
      })
    }
  }

  getCurrentState({ mode, alarmInfo }: RingDeviceData) {
    const {
      Characteristic: { SecuritySystemCurrentState: State },
    } = hap

    if (alarmInfo && this.alarmStates.includes(alarmInfo.state)) {
      return State.ALARM_TRIGGERED
    }

    switch (mode) {
      case 'all':
        return State.AWAY_ARM
      case 'some':
        return State.STAY_ARM
      case 'none':
        return State.DISARMED
      default:
        return State.DISARMED
    }
  }

  setTargetState(state: any) {
    const {
        Characteristic: { SecuritySystemTargetState: State },
      } = hap,
      { location, data } = this.device

    if (state === State.NIGHT_ARM) {
      state = State.STAY_ARM
      // Ring doesn't have night mode, so switch over to stay mode
      setTimeout(() => {
        this.getService(hap.Service.SecuritySystem)
          .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
          .updateValue(state)
      }, 100)
    }

    if (state === this.getCurrentState(data)) {
      this.targetState = undefined
      return
    }

    this.targetState = state

    if (state === State.AWAY_ARM) {
      this.logger.info(`Arming (Away) ${this.device.name}`)
      return location.armAway()
    } else if (state === State.DISARM) {
      this.logger.info(`Disarming ${this.device.name}`)
      return location.disarm()
    }
    this.logger.info(`Arming (Home) ${this.device.name}`)
    return location.armHome()
  }

  getTargetState(data: RingDeviceData) {
    return this.targetState || this.getCurrentState(data)
  }
}
