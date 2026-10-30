import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { API } from 'homebridge'
import { getSystemId, updateHomebridgeConfig } from '../config.ts'

describe('config', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'homebridge-ring-config-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('getSystemId persists a stable id and regenerates a corrupt one', () => {
    const systemId = getSystemId(dir)

    expect(systemId).toMatch(/^[0-9a-f]{64}$/)
    expect(getSystemId(dir)).toBe(systemId)

    writeFileSync(join(dir, '.ring.json'), 'not json')
    const regenerated = getSystemId(dir)
    expect(regenerated).not.toBe(systemId)
    expect(JSON.parse(readFileSync(join(dir, '.ring.json'), 'utf8'))).toEqual({
      systemId: regenerated,
    })
  })

  it('updateHomebridgeConfig only writes when the contents change', () => {
    const configPath = join(dir, 'config.json'),
      homebridge = { user: { configPath: () => configPath } } as API
    writeFileSync(configPath, 'token-a')

    expect(updateHomebridgeConfig(homebridge, (c) => c)).toBe(false)
    expect(updateHomebridgeConfig(homebridge, (c) => c.replace('a', 'b'))).toBe(
      true,
    )
    expect(readFileSync(configPath, 'utf8')).toBe('token-b')
  })
})
