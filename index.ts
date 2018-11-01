import { RingAlarmPlatform } from './src/ring-alarm-platform'
import { hap } from './src/hap'

export default function(homebridge: any) {
  hap.PlatformAccessory = homebridge.platformAccessory
  hap.Service = homebridge.hap.Service
  hap.Characteristic = homebridge.hap.Characteristic
  hap.UUIDGen = homebridge.hap.uuid
  hap.AccessoryCategories = homebridge.hap.Accessory.Categories

  homebridge.registerPlatform(
    'homebridge-ring-alarm',
    'RingAlarm',
    RingAlarmPlatform,
    true
  )
}
