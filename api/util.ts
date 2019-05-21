import debug = require('debug')
import { red } from 'colors'

const logger = debug('ring-alarm')

export function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

export function logInfo(message: any) {
  logger(message)
}

export function logError(message: any) {
  logger(red(message))
}
