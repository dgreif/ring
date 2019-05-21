import { RingDevice, RingDeviceType } from '../api'
import { HAP, hap } from './hap'
import { RingAlarmPlatformConfig } from './config'
import { BaseAccessory } from './base-accessory'

export class Beam extends BaseAccessory {
  constructor(
    public readonly device: RingDevice,
    public readonly accessory: HAP.Accessory,
    public readonly logger: HAP.Log,
    public readonly config: RingAlarmPlatformConfig
  ) {
    super()

    const { Characteristic, Service } = hap
    const { MotionSensor } = Service
    const {
      data: { deviceType }
    } = this.device

    if (deviceType !== RingDeviceType.BeamsTransformerSwitch) {
      this.registerCharacteristic(
        hap.Characteristic.MotionDetected,
        MotionSensor,
        data => data.motionStatus === 'faulted'
      )
      this.initSensorService(MotionSensor)
    }

    if (deviceType !== RingDeviceType.BeamsMotionSensor) {
      this.registerCharacteristic(
        Characteristic.On,
        Service.Lightbulb,
        data => Boolean(data.on),
        value => this.setOnState(value)
      )
    }

    if (deviceType === RingDeviceType.BeamsSwitch) {
      this.registerLevelCharacteristic(
        Characteristic.Brightness,
        Service.Lightbulb,
        data => (data.level && !isNaN(data.level) ? 100 * data.level : 0),
        value => this.setLevelState(value)
      )
    }
  }

  setOnState(on: boolean) {
    this.logger.info(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`)

    const data = on
      ? { lightMode: 'on', duration: this.config.beamDurationSeconds }
      : { lightMode: 'default' }

    return this.device.setInfo({
      command: {
        v1: [
          {
            commandType: 'light-mode.set',
            data
          }
        ]
      }
    })
  }

  setLevelState(level: number) {
    this.logger.info(`Setting brightness of ${this.device.name} to ${level}%`)

    return this.device.setInfo({
      device: { v1: { level: level / 100 } }
    })
  }
}
