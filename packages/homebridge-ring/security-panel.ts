import { BaseDeviceAccessory } from './base-device-accessory.ts'
import type {
  AlarmMode,
  AlarmState,
  RingDevice,
  RingDeviceData,
} from 'ring-client-api'
import { allAlarmStates, RingDeviceType } from 'ring-client-api'
import { hap } from './hap.ts'
import type { RingPlatformConfig } from './config.ts'
import type { PlatformAccessory } from 'homebridge'
import { logError, logInfo } from 'ring-client-api/util'

function isValidNightModeBypass(mode?: AlarmMode) {
  return mode && (mode === 'all' || mode === 'some')
}

export class SecurityPanel extends BaseDeviceAccessory {
  private alarmStates: AlarmState[]

  public readonly device
  public readonly accessory
  public readonly config

  constructor(
    device: RingDevice,
    accessory: PlatformAccessory,
    config: RingPlatformConfig,
  ) {
    super()

    this.device = device
    this.accessory = accessory
    this.config = config

    this.alarmStates = this.config.alarmOnEntryDelay
      ? allAlarmStates
      : allAlarmStates.filter((x) => x !== 'entry-delay')

    const { Characteristic, Service } = hap,
      validValues = [
        Characteristic.SecuritySystemTargetState.AWAY_ARM,
        Characteristic.SecuritySystemTargetState.STAY_ARM,
        Characteristic.SecuritySystemTargetState.DISARM,
      ]

    if (isValidNightModeBypass(config.nightModeBypassFor)) {
      validValues.push(Characteristic.SecuritySystemTargetState.NIGHT_ARM)
    }

    this.registerCharacteristic({
      characteristicType: Characteristic.SecuritySystemCurrentState,
      serviceType: Service.SecuritySystem,
      getValue: (data) => this.getCurrentState(data),
    })

    this.registerCharacteristic({
      characteristicType: Characteristic.SecuritySystemTargetState,
      serviceType: Service.SecuritySystem,
      getValue: (data) => this.getTargetState(data),
      setValue: (value) => this.setTargetState(value),
    })

    this.getService(Service.SecuritySystem)
      .getCharacteristic(Characteristic.SecuritySystemTargetState)
      .setProps({ validValues })

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

    this.getService(Service.SecuritySystem).setPrimaryService(true)
  }

  getTargetNightMode() {
    return this.targetingNightMode && this.config.nightModeBypassFor
  }

  getTargetState({ mode }: RingDeviceData) {
    const {
      Characteristic: { SecuritySystemTargetState: State },
    } = hap

    if (mode === this.getTargetNightMode()) {
      return State.NIGHT_ARM
    }

    // current mode does not match night mode target, so we are no longer targeting night mode
    this.targetingNightMode = false

    switch (mode) {
      case 'all':
        return State.AWAY_ARM
      case 'some':
        return State.STAY_ARM
      case 'none':
        return State.DISARM
      default:
        return State.DISARM
    }
  }

  getCurrentState(data: RingDeviceData) {
    const { alarmInfo } = data

    if (alarmInfo && this.alarmStates.includes(alarmInfo.state)) {
      return hap.Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED
    }

    return this.getTargetState(data)
  }

  get targetingNightMode() {
    return this.accessory.context.targetingNightMode
  }
  set targetingNightMode(value: boolean) {
    this.accessory.context.targetingNightMode = value
  }

  async setTargetState(state: any) {
    const {
        Characteristic: { SecuritySystemTargetState: State },
      } = hap,
      { location } = this.device,
      { nightModeBypassFor, allowDisarm } = this.config

    let bypass = false
    this.targetingNightMode = state === State.NIGHT_ARM

    if (state === State.NIGHT_ARM) {
      if (
        nightModeBypassFor &&
        (nightModeBypassFor === 'all' || nightModeBypassFor === 'some')
      ) {
        state = nightModeBypassFor === 'all' ? State.AWAY_ARM : State.STAY_ARM
        bypass = true
      } else {
        // Switch to Home since we don't know which mode the user wanted
        state = State.STAY_ARM
      }
    }

    // Prevent disarming if allowDisarm is false
    if (state === State.DISARM && allowDisarm === false) {
      // Quietly block instead of throwing (avoids Home app error toast)
      logInfo(`[Ring Alarm] Disarm blocked (allowDisarm=false) for ${this.device.name}`)
      try {
        // Nudge the Home app UI back to the previously known target state
        this.getService(hap.Service.SecuritySystem)
          .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
          .updateValue(this.getTargetState(this.device.data))
      } catch (_) {
        // best effort only
      }
      return // short-circuit: do NOT call Ring backend
    }

    const bypassContactSensors = bypass
        ? (await location.getDevices()).filter((device) => {
            return (
              device.deviceType === RingDeviceType.ContactSensor &&
              device.data.faulted
            )
          })
        : [],
      bypassSensorZids = bypassContactSensors.map((sensor) => sensor.id),
      bypassSensorNames = bypassContactSensors.map((sensor) => sensor.name),
      bypassLog = bypassSensorNames.length
        ? ' - Bypassing Sensors: ' + bypassSensorNames.join(', ')
        : ''

    try {
      if (state === State.AWAY_ARM) {
        logInfo(`Arming (Away) ${this.device.name}${bypassLog}`)
        await location.armAway(bypassSensorZids)
      } else if (state === State.DISARM) {
        logInfo(`Disarming ${this.device.name}`)
        await location.disarm()
      } else {
        logInfo(`Arming (Home) ${this.device.name}${bypassLog}`)
        await location.armHome(bypassSensorZids)
      }
    } catch (e: any) {
      logError(e)
      this.getService(hap.Service.SecuritySystem)
        .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
        .updateValue(this.getTargetState(this.device.data))
    }
  }
}
