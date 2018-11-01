import { BaseAccessory } from './base-accessory'
import { AlarmDevice, AlarmDeviceData } from 'ring-api'
import { distinctUntilChanged } from 'rxjs/operators'
import { HAP, hap } from './hap'

function getCurrentState({ mode, alarmInfo }: AlarmDeviceData) {
  const {
    Characteristic: { SecuritySystemCurrentState: State }
  } = hap

  if (alarmInfo && alarmInfo.state === 'burglar-alarm') {
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

export class SecurityPanel extends BaseAccessory {
  private targetState: any

  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()

    const { Characteristic, Service } = hap

    this.device.onData
      .pipe(distinctUntilChanged((a, b) => a.mode === b.mode))
      .subscribe(data => {
        this.targetState = this.getTargetState(data)
      })

    this.registerCharacteristic(
      Characteristic.SecuritySystemCurrentState,
      Service.SecuritySystem,
      data => {
        const state = getCurrentState(data)

        if (state === this.targetState) {
          this.targetState = undefined
        }

        return state
      }
    )

    this.registerCharacteristic(
      Characteristic.SecuritySystemTargetState,
      Service.SecuritySystem,
      data => this.getTargetState(data),
      value => this.setTargetState(value)
    )
  }

  setTargetState(state: any) {
    const {
        Characteristic: { SecuritySystemTargetState: State }
      } = hap,
      { alarm, data } = this.device

    if (state === State.NIGHT_ARM) {
      state = State.STAY_ARM
      // Ring doesn't have night mode, so switch over to stay mode
      setTimeout(() => {
        this.getService(hap.Service.SecuritySystem)
          .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
          .updateValue(state)
      }, 100)
    }

    if (state === getCurrentState(data)) {
      this.targetState = undefined
      return
    }

    this.targetState = state

    if (state === State.AWAY_ARM) {
      alarm.armAway()
    } else if (state === State.DISARM) {
      alarm.disarm()
    } else {
      alarm.armHome()
    }
  }

  getTargetState(data: AlarmDeviceData) {
    return this.targetState || getCurrentState(data)
  }
}
