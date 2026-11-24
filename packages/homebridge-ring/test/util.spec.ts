import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getMediaDirectory } from '../util.ts'

const packageRoot = path.resolve(import.meta.dirname, '..')

function moduleUrl(...segments: string[]) {
  return pathToFileURL(path.join(...segments)).href
}

describe('getMediaDirectory', () => {
  it('finds the bundled images from a module in the package root', () => {
    const media = getMediaDirectory(moduleUrl(packageRoot, 'camera-source.ts'))

    expect(media).toBe(path.join(packageRoot, 'media'))
    expect(existsSync(path.join(media, 'camera-offline.jpg'))).toBe(true)
    expect(existsSync(path.join(media, 'snapshots-blocked.jpg'))).toBe(true)
  })

  it('uses the package root for a module in lib', () => {
    expect(
      getMediaDirectory(moduleUrl(packageRoot, 'lib', 'camera-source.js')),
    ).toBe(path.join(packageRoot, 'media'))
  })

  it('keeps spaces in the install path', () => {
    const root = path.join(tmpdir(), 'Program Files', 'homebridge-ring')

    expect(getMediaDirectory(moduleUrl(root, 'lib', 'camera-source.js'))).toBe(
      path.join(root, 'media'),
    )
  })
})
