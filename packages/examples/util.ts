import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'

export const outputDirectory = join(__dirname, 'output')

export async function cleanOutputDirectory() {
  await rm(outputDirectory, {
    force: true,
    recursive: true,
  })
  await mkdir(outputDirectory)
}
