import { BaseAccessory } from './base-accessory'
import { AlarmDevice, AlarmDeviceData } from 'ring-api'
import { distinctUntilChanged } from 'rxjs/operators'
import { HAP, hap } from './hap'

function getCurrentState({ locked }: AlarmDeviceData) {
  const {
    Characteristic: { LockCurrentState: State }
  } = hap

  switch (locked) {
    case 'unlocked':
      return State.UNSECURED
    case 'locked':
      return State.SECURED
    case 'jammed':
      return State.JAMMED
    default:
      return State.UNKNOWN
  }
}

export class Lock extends BaseAccessory {
  private targetState: any

  constructor(
    public readonly device: AlarmDevice,
    public readonly accessory: HAP.Accessory
  ) {
    super()

    const { Characteristic, Service } = hap

    this.device.onData
      .pipe(distinctUntilChanged((a, b) => a.locked === b.locked))
      .subscribe(data => {
        this.targetState = this.getTargetState(data)
      })

    this.registerCharacteristic(
      Characteristic.LockCurrentState,
      Service.LockMechanism,
      data => {
        const state = getCurrentState(data)

        if (state === this.targetState) {
          this.targetState = undefined
        }

        return state
      }
    )

    this.registerCharacteristic(
      Characteristic.LockTargetState,
      Service.LockMechanism,
      data => this.getTargetState(data),
      value => this.setTargetState(value)
    )
  }

  setTargetState(state: any) {
    const {
        Characteristic: { LockTargetState: State }
      } = hap,
      { alarm, data, zid } = this.device

    this.targetState = state === getCurrentState(data) ? undefined : state

    return alarm.setDeviceInfo(zid, {
      command: {
        v1: [
          {
            commandType: `lock.${state === State.Secured ? 'lock' : 'unlock'}`,
            data: {}
          }
        ]
      }
    })
  }

  getTargetState(data: AlarmDeviceData) {
    return this.targetState || getCurrentState(data)
  }
}
