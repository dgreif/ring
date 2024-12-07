import { platformName, pluginName, RingPlatform } from './ring-platform.js'
import { setHap } from './hap.js'

export default function (homebridge: any) {
  setHap(homebridge.hap)
  homebridge.registerPlatform(pluginName, platformName, RingPlatform, true)
}
