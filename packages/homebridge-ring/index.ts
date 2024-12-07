import { platformName, pluginName, RingPlatform } from './ring-platform.ts'
import { setHap } from './hap.ts'

export default function (homebridge: any) {
  setHap(homebridge.hap)
  homebridge.registerPlatform(pluginName, platformName, RingPlatform, true)
}
