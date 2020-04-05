import { RingDevice, RingDeviceType } from '../api'
import { HAP, hap } from './hap'
import { RingPlatformConfig } from './config'
import { BaseDeviceAccessory } from './base-device-accessory'

export class Beam extends BaseDeviceAccessory {
  isLightGroup =
    this.device.data.deviceType === RingDeviceType.BeamsLightGroupSwitch
  groupId = this.device.data.groupId

  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap,
      { MotionSensor } = Service,
      {
        data: { deviceType },
      } = this.device

    if (deviceType !== RingDeviceType.BeamsTransformerSwitch) {
      this.registerCharacteristic(
        hap.Characteristic.MotionDetected,
        MotionSensor,
        (data) => data.motionStatus === 'faulted'
      )
      this.initSensorService(MotionSensor)
    }

    if (deviceType !== RingDeviceType.BeamsMotionSensor) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Lightbulb,
        (data) => Boolean(data.on),
        (value) => this.setOnState(value)
      )
    }

    if (deviceType === RingDeviceType.BeamsSwitch) {
      this.registerLevelCharacteristic(
        Characteristic.Brightness,
        Service.Lightbulb,
        (data) => (data.level && !isNaN(data.level) ? 100 * data.level : 0),
        (value) => this.setLevelState(value)
      )
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
