#!/usr/bin/env node
import { logRefreshToken } from './refresh-token'
logRefreshToken().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
