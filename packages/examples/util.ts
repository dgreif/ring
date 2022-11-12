import * as path from 'path'
import { promisify } from 'util'
import { mkdir } from 'fs'
const rimraf = require('rimraf')

export const outputDirectory = path.join(__dirname, 'output')

export async function cleanOutputDirectory() {
  await promisify(rimraf)(outputDirectory)
  await promisify(mkdir)(outputDirectory)
}
