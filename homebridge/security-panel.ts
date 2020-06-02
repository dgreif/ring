import { BaseDeviceAccessory } from './base-device-accessory'
import {
  AlarmMode,
  AlarmState,
  allAlarmStates,
  RingDevice,
  RingDeviceData,
  RingDeviceType,
} from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'

function isValidNightModeBypass(mode?: AlarmMode) {
  return mode && (mode === 'all' || mode === 'some')
}

export class SecurityPanel extends BaseDeviceAccessory {
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
      getValue: (data) => this.getCurrentState(data),
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

  async setTargetState(state: any) {
    const {
        Characteristic: { SecuritySystemTargetState: State },
      } = hap,
      { location } = this.device,
      { nightModeBypassFor } = this.config

    let bypass = false

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
        this.logger.info(`Arming (Away) ${this.device.name}${bypassLog}`)
        await location.armAway(bypassSensorZids)
      } else if (state === State.DISARM) {
        this.logger.info(`Disarming ${this.device.name}`)
        await location.disarm()
      } else {
        this.logger.info(`Arming (Home) ${this.device.name}${bypassLog}`)
        await location.armHome(bypassSensorZids)
      }
    } catch (e) {
      this.logger.error(e)
      this.getService(hap.Service.SecuritySystem)
        .getCharacteristic(hap.Characteristic.SecuritySystemTargetState)
        .updateValue(this.getCurrentState(this.device.data))
    }
  }
}
