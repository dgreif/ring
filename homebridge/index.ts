import { platformName, pluginName, RingPlatform } from './ring-platform'
import { hap } from './hap'

export default function (homebridge: any) {
  hap.PlatformAccessory = homebridge.platformAccessory
  hap.Service = homebridge.hap.Service
  hap.Characteristic = homebridge.hap.Characteristic
  hap.UUIDGen = homebridge.hap.uuid
  hap.AccessoryCategories = homebridge.hap.Accessory.Categories
  hap.StreamController = homebridge.hap.StreamController

  homebridge.registerPlatform(pluginName, platformName, RingPlatform, true)
}
