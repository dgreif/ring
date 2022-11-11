import { platformName, pluginName, RingPlatform } from './ring-platform'
import { setHap } from './hap'

export default function (homebridge: any) {
  setHap(homebridge.hap)
  homebridge.registerPlatform(pluginName, platformName, RingPlatform, true)
}
