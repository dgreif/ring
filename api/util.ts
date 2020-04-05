import debug = require('debug')
import { red } from 'colors'
import { createInterface } from 'readline'
import { v4 as generateRandomUuid, v5 as generateUuidFromNamespace } from 'uuid'
import { machineId } from 'node-machine-id'

const debugLogger = debug('ring'),
  uuidNamespace = 'e53ffdc0-e91d-4ce1-bec2-df939d94739c'

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
    },
  },
  debugEnabled = false

export function delay(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

export function logDebug(message: any) {
  if (debugEnabled) {
    logger.logInfo(message)
  }
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

export function enableDebug() {
  debugEnabled = true
}

export function generateUuid(seed?: string) {
  if (seed) {
    return generateUuidFromNamespace(seed, uuidNamespace)
  }

  return generateRandomUuid()
}

export async function getHardwareId() {
  const id = await Promise.race([machineId(), delay(5000).then(() => '')])

  if (!id) {
    logError(
      'Request for machine id timed out.  Falling back to random session id'
    )
    return generateRandomUuid()
  }

  return generateUuid(id)
}

export async function requestInput(question: string) {
  const lineReader = createInterface({
      input: process.stdin,
      output: process.stdout,
    }),
    answer = await new Promise<string>((resolve) => {
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

export function mapAsync<T, U>(
  records: T[],
  asyncMapper: (record: T) => Promise<U>
): Promise<U[]> {
  return Promise.all(records.map((record) => asyncMapper(record)))
}
