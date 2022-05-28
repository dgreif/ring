import { Location, LocationMode } from '../api'
import { distinctUntilChanged } from 'rxjs/operators'
import { hap } from './hap'
import { RingPlatformConfig } from './config'
import { logError } from '../api/util'
import { BaseAccessory } from './base-accessory'
import { firstValueFrom, of } from 'rxjs'
import {
  Logging,
  PlatformAccessory,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
} from 'homebridge'

function getStateFromMode(mode: LocationMode) {
  const {
    Characteristic: { SecuritySystemCurrentState: State },
  } = hap

  switch (mode) {
    case 'away':
      return State.AWAY_ARM
    case 'home':
      return State.STAY_ARM
    case 'disarmed':
      return State.DISARMED
    default:
      return State.DISARMED
  }
}

export class LocationModeSwitch extends BaseAccessory<Location> {
  private targetState: any
  public device = this.location // for use in BaseAccessory

  constructor(
    private readonly location: Location,
    public readonly accessory: PlatformAccessory,
    public readonly logger: Logging,
    public readonly config: RingPlatformConfig
  ) {
    super()
    const {
        Characteristic,
        Service: { SecuritySystem, AccessoryInformation },
      } = hap,
      accessoryName = location.name + ' Mode',
      service = this.getService(SecuritySystem, accessoryName),
      currentState = service.getCharacteristic(
        Characteristic.SecuritySystemCurrentState
      ),
      targetState = service.getCharacteristic(
        Characteristic.SecuritySystemTargetState
      ),
      getCurrentMode = () => {
        return firstValueFrom(location.onLocationMode)
      },
      getCurrentState = async () => getStateFromMode(await getCurrentMode())

    location.onLocationMode.pipe(distinctUntilChanged()).subscribe((mode) => {
      const state = getStateFromMode(mode)

      if (state === this.targetState) {
        this.targetState = undefined
      }

      if (!this.targetState) {
        targetState.updateValue(state)
      }

      currentState.updateValue(state)
    })

    currentState.on(
      CharacteristicEventTypes.GET,
      async (callback: CharacteristicGetCallback) => {
        location.getLocationMode().catch((e) => {
          logError('Failed to retrieve location mode for ' + location.name)
          logError(e)
        })
        const state = await getCurrentState()

        if (state === this.targetState) {
          this.targetState = undefined
        }

        callback(null, state)
      }
    )

    targetState.on(
      CharacteristicEventTypes.GET,
      async (callback: CharacteristicGetCallback) => {
        callback(
          null,
          this.targetState !== undefined
            ? this.targetState
            : await getCurrentState()
        )
      }
    )

    targetState.on(
      CharacteristicEventTypes.SET,
      async (
        state: CharacteristicValue,
        callback: CharacteristicSetCallback
      ) => {
        const {
          Characteristic: { SecuritySystemTargetState: State },
        } = hap

        callback()

        if (state === State.NIGHT_ARM) {
          state = State.STAY_ARM
          // Ring doesn't have night mode, so switch over to stay mode
          setTimeout(() => targetState.updateValue(state), 100)
        }

        if (state === (await getCurrentState())) {
          this.targetState = undefined
          return
        }

        this.targetState = state

        if (state === State.AWAY_ARM) {
          this.logger.info(`Setting ${this.location.name} Mode to away`)
          return this.location.setLocationMode('away')
        } else if (state === State.DISARM) {
          this.logger.info(`Setting ${this.location.name} Mode to disarmed`)
          return this.location.setLocationMode('disarmed')
        }
        this.logger.info(`Setting ${this.location.name} Mode to home`)
        return this.location.setLocationMode('home')
      }
    )

    targetState.setProps({
      validValues: [
        Characteristic.SecuritySystemTargetState.AWAY_ARM,
        Characteristic.SecuritySystemTargetState.STAY_ARM,
        Characteristic.SecuritySystemTargetState.DISARM,
      ],
    })

    this.registerObservableCharacteristic({
      characteristicType: Characteristic.Manufacturer,
      serviceType: AccessoryInformation,
      onValue: of('Ring'),
    })

    this.registerObservableCharacteristic({
      characteristicType: Characteristic.Model,
      serviceType: AccessoryInformation,
      onValue: of('Location Mode'),
    })
    this.registerObservableCharacteristic({
      characteristicType: Characteristic.SerialNumber,
      serviceType: AccessoryInformation,
      onValue: of('N/A'),
    })
  }
}
