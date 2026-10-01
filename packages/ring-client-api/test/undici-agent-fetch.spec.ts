import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toBase64 } from '../util.ts'

/**
 * Regression coverage for undici@8 Agent + fetch pairing.
 *
 * Existing rest-client.spec.ts uses MSW, which intercepts global fetch and
 * never runs the real undici dispatcher — so CI never saw
 * UND_ERR_INVALID_ARG after the undici 8 bump. These tests exercise the
 * Agent path and assert RingRestClient calls undici's fetch with a dispatcher.
 */
const undiciTest = vi.hoisted(() => {
  const fetchMock = vi.fn()
  return {
    fetchMock,
    // Filled in by the undici mock factory below
    actualFetch: null as null | ((...args: any[]) => Promise<any>),
  }
})

vi.mock('undici', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal typing
  const actual = await importOriginal<typeof import('undici')>()
  undiciTest.actualFetch = actual.fetch
  undiciTest.fetchMock.mockImplementation((input, init) =>
    actual.fetch(input, init),
  )
  return {
    ...actual,
    fetch: undiciTest.fetchMock,
  }
})

const { Agent, Response: UndiciResponse } = await import('undici'),
  { RingRestClient } = await import('../rest-client.ts')

/** Same options as rest-client.ts fetchAgent */
function createRestClientAgent() {
  return new Agent({
    connections: 6,
    pipelining: 1,
    keepAliveTimeout: 115000,
  })
}

async function withLocalServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const server = createServer(handler)
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  )
  const { port } = server.address() as AddressInfo
  try {
    await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  }
}

describe('undici Agent / fetch pairing', () => {
  afterEach(() => {
    undiciTest.fetchMock.mockReset()
    undiciTest.fetchMock.mockImplementation((input, init) =>
      undiciTest.actualFetch!(input, init),
    )
  })

  it('rest-client Agent options work with undici fetch against a local server', async () => {
    await withLocalServer(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      },
      async (baseUrl) => {
        const agent = createRestClientAgent()
        try {
          const response = await undiciTest.fetchMock(`${baseUrl}/`, {
            dispatcher: agent,
          })
          expect(response.status).toBe(200)
          expect(await response.json()).toEqual({ ok: true })
        } finally {
          await agent.close()
        }
      },
    )
  })

  it('rejects undici Agent via global fetch when Node bundled undici major < 8', async () => {
    const bundledUndici = process.versions.undici
    if (!bundledUndici) {
      return
    }
    const bundledMajor = Number(bundledUndici.split('.')[0])
    if (bundledMajor >= 8) {
      // Node 26+: bundled undici matches npm undici 8; mismatch does not apply
      return
    }

    await withLocalServer(
      (_req, res) => {
        res.writeHead(200)
        res.end('ok')
      },
      async (baseUrl) => {
        const agent = createRestClientAgent()
        try {
          await expect(
            fetch(`${baseUrl}/`, {
              // @ts-expect-error dispatcher is an undici extension on RequestInit
              dispatcher: agent,
            }),
          ).rejects.toThrow()
        } finally {
          await agent.close()
        }
      },
    )
  })

  it('RingRestClient oauth uses undici.fetch with a dispatcher', async () => {
    const refreshToken = 'ey__refresh_token',
      wrappedRefresh = toBase64(
        JSON.stringify({ rt: refreshToken, hid: 'test-hardware-id' }),
      )

    undiciTest.fetchMock.mockImplementation(() =>
      Promise.resolve(
        new UndiciResponse(
          JSON.stringify({
            access_token: 'ey__access',
            expires_in: 3600,
            refresh_token: 'ey__next_refresh',
            scope: 'client',
            token_type: 'Bearer',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      ),
    )

    const client = new RingRestClient({ refreshToken: wrappedRefresh }),
      auth = await client.getAuth()

    expect(undiciTest.fetchMock).toHaveBeenCalled()
    expect(auth.access_token).toBe('ey__access')

    const init = undiciTest.fetchMock.mock.calls[0]?.[1] as
      | { dispatcher?: unknown }
      | undefined
    expect(init?.dispatcher).toBeInstanceOf(Agent)
  })
})
