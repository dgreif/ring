import debug = require('debug')
import { red } from 'colors'
import { randomBytes } from 'crypto'
import { createInterface } from 'readline'

const debugLogger = debug('ring')

interface Logger {
  logInfo: (message: string) => void
  logError: (message: string) => void
}

let logger: Logger = {
  logInfo(message) {
    debugLogger(message)
  },
  logError(message) {
    debugLogger(red(message))
  }
}

export function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

export function logInfo(message: any) {
  logger.logInfo(message)
}

export function logError(message: any) {
  logger.logError(message)
}

export function useLogger(newLogger: Logger) {
  logger = newLogger
}

export function generateRandomId() {
  const id = randomBytes(16).toString('hex')
  return (
    id.substr(0, 8) +
    '-' +
    id.substr(8, 4) +
    '-' +
    id.substr(12, 4) +
    '-' +
    id.substr(16, 4) +
    '-' +
    id.substr(20, 12)
  )
}

export async function requestInput(question: string) {
  const lineReader = createInterface({
      input: process.stdin,
      output: process.stdout
    }),
    answer = await new Promise<string>(resolve => {
      lineReader.question(question, resolve)
    })

  lineReader.close()

  return answer.trim()
}

export function stringify(data: any) {
  if (typeof data === 'string') {
    return data
  }

  if (typeof data === 'object' && Buffer.isBuffer(data)) {
    return data.toString()
  }

  return JSON.stringify(data) + ''
}

/**
 * Returns a Promise that will resolve after the number of seconds provided. Useful
 * for keeping the async/await patterns in functions that require a simple sleep.
 * 
 * @param numberOfSeconds the number of seconds that this function will take to exit.
 * @return {Promise<void>} a Promise that will resolve after the number of seconds provided.
 */
export function timeout(numberOfSeconds:number) : Promise<void>{
  return new Promise((resolve) => {
    setTimeout(()=>resolve(), numberOfSeconds*1000);
  })
}
