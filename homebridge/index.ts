import { RingPlatform } from './ring-platform'
import { hap } from './hap'
import { readFileSync, writeFileSync } from 'fs'
import { join as joinPath } from 'path'
import {
  oldPlatformName,
  oldPluginName,
  platformName,
  pluginName
} from './plugin-info'
import { logError } from '../api/util'
import { updateHomebridgeConfig } from './config'

export default function(homebridge: any) {
  hap.PlatformAccessory = homebridge.platformAccessory
  hap.Service = homebridge.hap.Service
  hap.Characteristic = homebridge.hap.Characteristic
  hap.UUIDGen = homebridge.hap.uuid
  hap.AccessoryCategories = homebridge.hap.Accessory.Categories
  hap.StreamController = homebridge.hap.StreamController

  try {
    // This plugin was changed from homebridge-ring-alarm to homebridge-ring
    // This code cleans up the config/cache files to point to the new plugin

    const cachedAccessoriesPath = joinPath(
        homebridge.user.cachedAccessoryPath(),
        'cachedAccessories'
      ),
      cachedAccessories = readFileSync(cachedAccessoriesPath).toString(),
      updatedAccessories = cachedAccessories
        .replace(new RegExp(oldPluginName, 'g'), pluginName)
        .replace(new RegExp(oldPlatformName, 'g'), platformName)

    let filesChanged = updateHomebridgeConfig(homebridge, config => {
      return config.replace(`"${oldPlatformName}"`, `"${platformName}"`)
    })

    if (cachedAccessories !== updatedAccessories) {
      writeFileSync(cachedAccessoriesPath, updatedAccessories)
      filesChanged = true
    }

    if (filesChanged) {
      logError(
        'Your Ring Alarm config has been updated to new Ring config.  This is a one time thing, and you do not need to do anything.  Just restart homebridge and everything should start normally.'
      )
      process.exit(1)
    }
  } catch (_) {
    void _
  }

  homebridge.registerPlatform(pluginName, platformName, RingPlatform, true)
}
