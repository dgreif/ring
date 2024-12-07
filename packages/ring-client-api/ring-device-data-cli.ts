#!/usr/bin/env node
import { logDeviceData } from './device-data.js'
logDeviceData().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
