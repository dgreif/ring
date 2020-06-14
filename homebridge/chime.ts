import { RingChime } from '../api'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { Logging, PlatformAccessory } from 'homebridge'
import { BaseDataAccessory } from './base-data-accessory'
import { logInfo } from '../api/util'

const minutesFor24Hours = 24 * 60

export class Chime extends BaseDataAccessory<RingChime> {
  constructor(
    public readonly device: RingChime,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()
    const { Characteristic, Service } = hap,
      snoozeService = this.getService(
        Service.Switch,
        device.name + ' Snooze',
        'snooze'
      ),
      playDingService = this.getService(
        Service.Switch,
        device.name + ' Play Ding',
        'play-ding'
      ),
      playMotionService = this.getService(
        Service.Switch,
        device.name + ' Play Motion',
        'play-motion'
      )

    // Snooze Switch
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: snoozeService,
      getValue: (data) => Boolean(data.do_not_disturb.seconds_left),
      setValue: (snooze: boolean) => {
        if (snooze) {
          logInfo(device.name + ' snoozed for 24 hours')
          return device.snooze(minutesFor24Hours)
        }

        logInfo(device.name + ' snooze cleared')

        return device.clearSnooze()
      },
      requestUpdate: () => device.requestUpdate(),
    })
    snoozeService.setPrimaryService(true)

    // Speaker Service
    this.registerCharacteristic({
      characteristicType: Characteristic.Mute,
      serviceType: Service.Speaker,
      getValue: () => false,
    })
    this.registerLevelCharacteristic({
      characteristicType: Characteristic.Volume,
      serviceType: Service.Speaker,
      getValue: (data) => data.settings.volume,
      setValue: (volume: number) => device.setVolume(volume),
      requestUpdate: () => device.requestUpdate(),
    })
    this.getService(Service.Speaker)
      .getCharacteristic(Characteristic.Volume)
      .setProps({
        minValue: 0,
        maxValue: 11,
      })

    // Play Sound Switches
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: playDingService,
      getValue: () => false,
      setValue: (play: boolean) => {
        if (!play) {
          return
        }

        setTimeout(() => {
          playDingService
            .getCharacteristic(Characteristic.On)
            .updateValue(false)
        }, 1000)
        return this.device.playSound('ding')
      },
      requestUpdate: () => device.requestUpdate(),
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.On,
      serviceType: playMotionService,
      getValue: () => false,
      setValue: (play: boolean) => {
        if (!play) {
          return
        }

        setTimeout(() => {
          playMotionService
            .getCharacteristic(Characteristic.On)
            .updateValue(false)
        }, 1000)
        return this.device.playSound('motion')
      },
      requestUpdate: () => device.requestUpdate(),
    })

    // Accessory Information Service
    this.registerCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: Service.AccessoryInformation,
      getValue: () => 'Ring',
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: Service.AccessoryInformation,
      getValue: () => device.model,
    })
    this.registerCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: Service.AccessoryInformation,
      getValue: (data) => data.device_id || 'Unknown',
    })
  }
}
