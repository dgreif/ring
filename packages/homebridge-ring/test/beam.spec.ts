import { describe, it } from 'vitest'
import { Beam } from '../beam.ts'
import {
  getCharacteristic,
  hap,
  initAccessory,
  createRingDevice,
  expectSet,
} from './harness.ts'
import { RingDeviceCategory, RingDeviceType } from 'ring-client-api'

describe('Beam', () => {
  it('On → light-mode.set; light group → setLightGroup', async () => {
    const device = createRingDevice({
        name: 'Path Light',
        zid: 'zid-beam',
        deviceType: RingDeviceType.BeamsSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'ok',
        tamperStatus: 'ok',
        on: false,
        manufacturerName: 'Ring',
      }),
      { platformAccessory } = initAccessory(
        Beam,
        device,
        'Path Light',
        'beam-1',
      ),
      on = getCharacteristic(
        platformAccessory,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )

    await expectSet(on, true, device.sendCommand, 'light-mode.set', {
      lightMode: 'on',
      duration: undefined,
    })

    const groupDevice = createRingDevice({
        name: 'All Lights',
        zid: 'zid-beam-group',
        deviceType: RingDeviceType.BeamsLightGroupSwitch,
        categoryId: RingDeviceCategory.Lights,
        batteryStatus: 'none',
        tamperStatus: 'ok',
        on: false,
        groupId: 'group-1',
        manufacturerName: 'Ring',
      }),
      { platformAccessory: groupAcc } = initAccessory(
        Beam,
        groupDevice,
        'All Lights',
        'beam-group-1',
      ),
      groupOn = getCharacteristic(
        groupAcc,
        hap.Service.Lightbulb,
        hap.Characteristic.On,
      )
    await expectSet(
      groupOn,
      true,
      groupDevice.location.setLightGroup,
      'group-1',
      true,
      undefined,
    )
  })
})
