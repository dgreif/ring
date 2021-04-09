import { RingDevice, RingDeviceType } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { BaseDeviceAccessory } from './base-device-accessory'
import { Logging, PlatformAccessory } from 'homebridge'

export class Beam extends BaseDeviceAccessory {
  isLightGroup =
    this.device.data.deviceType === RingDeviceType.BeamsLightGroupSwitch
  groupId = this.device.data.groupId

  constructor(
    public readonly device: RingDevice,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap,
      { MotionSensor } = Service,
      {
        data: { deviceType },
      } = this.device

    if (deviceType !== RingDeviceType.BeamsMotionSensor) {
      this.registerCharacteristic({
        characteristicType: Characteristic.On,
        serviceType: Service.Lightbulb,
        getValue: (data) => Boolean(data.on),
        setValue: (value) => this.setOnState(value),
      })
      this.getService(Service.Lightbulb).setPrimaryService(true)
    }

    if (deviceType === RingDeviceType.BeamsMultiLevelSwitch) {
      this.registerLevelCharacteristic({
        characteristicType: Characteristic.Brightness,
        serviceType: Service.Lightbulb,
        getValue: (data) => {
          return data.level && !isNaN(data.level) ? 100 * data.level : 0
        },
        setValue: (value) => this.setLevelState(value),
      })
    }

    if (device.data.motionStatus !== undefined) {
      this.registerCharacteristic({
        characteristicType: hap.Characteristic.MotionDetected,
        serviceType: MotionSensor,
        getValue: (data) => data.motionStatus === 'faulted',
      })
      this.initSensorService(MotionSensor)
    }
  }

  setOnState(on: boolean) {
    this.logger.info(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    const { beamDurationSeconds } = this.config,
      duration = beamDurationSeconds
        ? Math.min(beamDurationSeconds, 32767)
        : undefined

    if (this.isLightGroup && this.groupId) {
      return this.device.location.setLightGroup(this.groupId, on, duration)
    }

    const data = on ? { lightMode: 'on', duration } : { lightMode: 'default' }

    return this.device.sendCommand('light-mode.set', data)
  }

  setLevelState(level: number) {
    this.logger.info(`Setting brightness of ${this.device.name} to ${level}%`)

    return this.device.setInfo({
      device: { v1: { level: level / 100 } },
    })
  }
}
