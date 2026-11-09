import { createHash } from 'crypto'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { RingRestClient } from '../rest-client.ts'
import { clearTimeouts, getHardwareId, toBase64 } from '../util.ts'
import { firstValueFrom } from 'rxjs'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

// rest-client uses undici's fetch (paired with undici Agent). MSW only
// intercepts global fetch, so route undici.fetch through globalThis.fetch
// in tests. Drop `dispatcher` — Node's global fetch rejects an undici@8 Agent.
vi.mock('undici', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- vitest importOriginal typing
  const undici = await importOriginal<typeof import('undici')>()
  return {
    ...undici,
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const rest = { ...(init as RequestInit & { dispatcher?: unknown }) }
      delete rest.dispatcher
      return globalThis.fetch(input, rest)
    },
  }
})

let sessionCreatedCount = 0,
  client: RingRestClient
const email = 'some@one.com',
  password = 'abc123!',
  phone = '+1xxxxxxxx89',
  twoFactorAuthCode = '123456',
  hardwareIdPromise = getHardwareId(),
  accessToken = 'ey__accees_token',
  secondAccessToken = 'ey__second_accees_token',
  refreshToken = 'ey__refresh_token',
  secondRefreshToken = 'ey__second_refresh_token',
  thirdRefreshToken = 'ey__third_refresh_token',
  authorizationCode = 'authorization_code_from_ring',
  csrfToken = 'csrf_token_from_ring',
  sessionCookie = 'web_session_id',
  // The state of the one web sign-in the fake Ring server is handling
  webSignIn: {
    codeChallenge?: string
    state?: string
    signedIn: boolean
    verified: boolean
  } = { signedIn: false, verified: false },
  hasSessionCookie = (req: Request) =>
    req.headers.get('cookie')?.includes(`session=${sessionCookie}`),
  invalidRequest = (message: string) =>
    HttpResponse.json({ error: message }, { status: 400 }),
  server = setupServer(
    http.get(
      'https://oauth.ring.com/oauth/v2/authorize',
      ({ request: req }) => {
        const params = new URL(req.url).searchParams

        if (params.has('client_id')) {
          // Start of a sign-in
          if (
            params.get('client_id') !== 'ring_official_android' ||
            params.get('response_type') !== 'code' ||
            params.get('scope') !== 'client' ||
            params.get('redirect_uri') !== 'https://ring.com/signin/callback' ||
            params.get('code_challenge_method') !== 'S256' ||
            !params.get('code_challenge') ||
            !params.get('state')
          ) {
            return invalidRequest('Invalid authorize request: ' + params)
          }

          webSignIn.codeChallenge = params.get('code_challenge')!
          webSignIn.state = params.get('state')!
          webSignIn.signedIn = false
          webSignIn.verified = false

          return new HttpResponse(null, {
            status: 302,
            headers: {
              Location: '/oauth/v2/signin',
              'Set-Cookie': `session=${sessionCookie}; Path=/; HttpOnly; Secure`,
            },
          })
        }

        if (!hasSessionCookie(req) || !webSignIn.verified) {
          return new HttpResponse(null, {
            status: 302,
            headers: { Location: '/oauth/v2/signin' },
          })
        }

        // Signed in, redirect back to the app with the authorization code
        return new HttpResponse(null, {
          status: 302,
          headers: {
            Location: `https://ring.com/signin/callback?code=${authorizationCode}&state=${webSignIn.state}`,
          },
        })
      },
    ),
    http.get('https://oauth.ring.com/oauth/v2/signin', ({ request: req }) => {
      if (!hasSessionCookie(req)) {
        return HttpResponse.text('No session', { status: 401 })
      }

      return HttpResponse.html(
        `<html><head><script id="oauth-args" type="application/json">{"app-args":{},"csrf-token":"${csrfToken}"}</script></head></html>`,
      )
    }),
    http.post(
      'https://oauth.ring.com/oauth/v2/signin',
      async ({ request: req }) => {
        const form = new URLSearchParams(await req.text())

        if (!hasSessionCookie(req) || form.get('csrf-token') !== csrfToken) {
          return invalidRequest('Missing session or csrf token')
        }

        if (
          form.get('username') !== email ||
          form.get('password') !== password
        ) {
          // Wrong username or password
          return HttpResponse.json(
            {
              error: 'unauthorized',
              error_cause: 'invalid_user_credentials',
              error_description: 'Invalid user credentials.',
            },
            { status: 401 },
          )
        }

        webSignIn.signedIn = true

        // Credentials accepted, a 2fa code was sent
        return HttpResponse.json(
          {
            next_time_in_secs: 60,
            phone,
            tsv_state: 'sms',
          },
          { status: 412 },
        )
      },
    ),
    http.post(
      'https://oauth.ring.com/oauth/v2/2fa/verify',
      async ({ request: req }) => {
        const form = new URLSearchParams(await req.text())

        if (
          !hasSessionCookie(req) ||
          form.get('csrf-token') !== csrfToken ||
          !webSignIn.signedIn
        ) {
          return invalidRequest('Missing session or csrf token')
        }

        if (form.get('2fa_code') !== twoFactorAuthCode) {
          // Wrong 2fa code
          return HttpResponse.json(
            { error: 'invalid_request', error_description: 'Invalid code' },
            { status: 400 },
          )
        }

        webSignIn.verified = true
        return HttpResponse.json({})
      },
    ),
    http.post(
      'https://oauth.ring.com/oauth/token',
      async ({ request: req }) => {
        if (
          req.headers.get('User-Agent') !== 'android:com.ringapp' ||
          req.headers.get('hardware_id') !== (await hardwareIdPromise)
        ) {
          return HttpResponse.json(
            {
              code: 1,
              error:
                'Invalid auth headers: ' + JSON.stringify(req.headers, null, 2),
            },
            { status: 400 },
          )
        }

        if (
          req.headers
            .get('Content-Type')
            ?.startsWith('application/x-www-form-urlencoded')
        ) {
          // Exchange of an authorization code from the web sign-in
          const form = new URLSearchParams(await req.text()),
            codeVerifier = form.get('code_verifier') || '',
            expectedChallenge = createHash('sha256')
              .update(codeVerifier)
              .digest('base64url')

          if (
            form.get('grant_type') !== 'authorization_code' ||
            form.get('client_id') !== 'ring_official_android' ||
            form.get('redirect_uri') !== 'https://ring.com/signin/callback' ||
            form.get('code') !== authorizationCode ||
            expectedChallenge !== webSignIn.codeChallenge
          ) {
            return HttpResponse.json(
              { error: 'invalid_grant', error_description: 'Invalid code' },
              { status: 400 },
            )
          }

          return HttpResponse.json({
            access_token: accessToken,
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: 'client',
            token_type: 'Bearer',
          })
        }

        const body: any = await req.json()

        if (req.headers.get('2fa-support') !== 'true') {
          return invalidRequest('Missing 2fa-support header')
        }

        if (body.grant_type === 'password') {
          // The legacy password grant is blocked by Ring
          return HttpResponse.text('406 Not Acceptable', { status: 406 })
        }

        if (body.grant_type === 'refresh_token') {
          if (body.refresh_token === refreshToken) {
            // Valid refresh token
            return HttpResponse.json(
              {
                access_token: accessToken,
                expires_in: 3600,
                refresh_token: secondRefreshToken,
                scope: 'client',
                token_type: 'Bearer',
              },
              { status: 200 },
            )
          }

          if (body.refresh_token === secondRefreshToken) {
            // Valid refresh token
            return HttpResponse.json(
              {
                access_token: secondAccessToken,
                expires_in: 3600,
                refresh_token: thirdRefreshToken,
                scope: 'client',
                token_type: 'Bearer',
              },
              { status: 200 },
            )
          }

          // Invalid refresh token
          return HttpResponse.json(
            {
              error: 'invalid_grant',
              error_description: 'token is invalid or does not exists',
            },
            { status: 401 },
          )
        }

        return invalidRequest('Invalid auth request: ' + JSON.stringify(body))
      },
    ),
    http.post(
      'https://api.ring.com/clients_api/session',
      async ({ request: req }) => {
        const authHeader = req.headers.get('Authorization')

        if (
          authHeader !== `Bearer ${accessToken}` &&
          authHeader !== `Bearer ${secondAccessToken}`
        ) {
          // Invalid access token used
          return HttpResponse.json({}, { status: 401 })
        }

        const body: any = await req.json()
        if (
          body.device.hardware_id !== (await getHardwareId()) ||
          body.device.metadata.api_version !== 11 ||
          body.device.metadata.device_model !== 'ring-client-api' ||
          body.device.os !== 'android'
        ) {
          return HttpResponse.text(
            'Bad session request: ' + JSON.stringify(body, null, 2),
            { status: 400 },
          )
        }

        // Fake a response from the session endpoint, incrementing the sessionCreatedCount
        sessionCreatedCount++
        return HttpResponse.json({
          profile: {
            id: 1234,
          },
        })
      },
    ),
  )

async function wrapRefreshToken(rt: string) {
  return toBase64(
    JSON.stringify({
      rt,
      hid: await hardwareIdPromise,
    }),
  )
}

beforeEach(() => {
  sessionCreatedCount = 0
})

beforeAll(() => {
  // Establish requests interception layer before all tests.
  server.listen()
})

afterAll(() => {
  // Clean up after all tests are done, preventing this
  // interception layer from affecting irrelevant tests.
  server.close()
})

afterEach(() => {
  server.resetHandlers()
  client.clearTimeouts()
  clearTimeouts()
})

describe('getAuth', () => {
  it('should throw and set the 2fa prompt', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow(
      'Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.',
    )

    expect(client.promptFor2fa).toEqual(
      `Please enter the code sent to ${phone} via sms`,
    )
    expect(client.using2fa).toEqual(true)
  })

  it('should accept a 2fa code', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    // ignore the first reject, it's tested above
    await expect(() => client.getAuth()).rejects.toThrow()

    // call getAuth again with the 2fa code, which should succeed
    const auth = await client.getAuth(twoFactorAuthCode)
    expect(auth).toMatchObject({
      access_token: accessToken,
      refresh_token: await wrapRefreshToken(refreshToken),
    })
    expect(client.refreshToken).toEqual(await wrapRefreshToken(refreshToken))
  })

  it('should handle invalid credentials', async () => {
    client = new RingRestClient({
      password: 'incorrect password',
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring. Verify that your email and password are correct. (error: unauthorized)',
    )
  })

  it('should handle a non-json error response', async () => {
    server.use(
      http.get('https://oauth.ring.com/oauth/v2/authorize', () =>
        HttpResponse.text(
          '<html><head><title>406 Not Acceptable</title></head></html>',
          { status: 406 },
        ),
      ),
    )
    client = new RingRestClient({
      password,
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring. Verify that your email and password are correct. (error: HTTP 406)',
    )
  })

  it('should handle invalid 2fa code', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    // ignore the first reject, it's it('ove
    await expect(() => client.getAuth()).rejects.toThrow()

    // call getAuth again with an invalid 2fa code, which should fail
    await expect(() => client.getAuth('invalid 2fa code')).rejects.toThrow(
      'Verification Code is invalid or expired',
    )
    expect(client.promptFor2fa).toEqual(
      'Invalid 2fa code entered.  Please try again.',
    )
  })

  it('should accept a valid 2fa code after an invalid one', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow()
    await expect(() => client.getAuth('invalid 2fa code')).rejects.toThrow()

    // the same sign-in is kept, so the code that was sent still works
    const auth = await client.getAuth(twoFactorAuthCode)
    expect(auth).toMatchObject({
      access_token: accessToken,
      refresh_token: await wrapRefreshToken(refreshToken),
    })
  })

  it('should not send the password grant to the oauth token endpoint', async () => {
    const tokenRequests: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.url === 'https://oauth.ring.com/oauth/token') {
        tokenRequests.push(request.headers.get('Content-Type') || '')
      }
    })
    client = new RingRestClient({
      password,
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow()
    await client.getAuth(twoFactorAuthCode)
    server.events.removeAllListeners()

    expect(tokenRequests).toEqual(['application/x-www-form-urlencoded'])
  })

  it('should establish a valid auth token with a valid refresh token', async () => {
    client = new RingRestClient({
      refreshToken,
    })

    expect(await client.getCurrentAuth()).toMatchObject({
      access_token: accessToken,
      refresh_token: await wrapRefreshToken(secondRefreshToken),
    })
    expect(client.refreshToken).toEqual(
      await wrapRefreshToken(secondRefreshToken),
    )
  })

  it('should emit an event when a new refresh token is created', async () => {
    client = new RingRestClient({
      refreshToken,
    })
    const refreshedPromise = firstValueFrom(client.onRefreshTokenUpdated),
      auth = await client.getAuth()
    expect(auth).toMatchObject({
      access_token: accessToken,
      refresh_token: await wrapRefreshToken(secondRefreshToken),
    })
    expect(await refreshedPromise).toEqual({
      oldRefreshToken: refreshToken,
      newRefreshToken: await wrapRefreshToken(secondRefreshToken),
    })
  })
})

describe('fetch', () => {
  let invalidateFirstAccessToken = false

  beforeEach(() => {
    invalidateFirstAccessToken = false
    server.use(
      http.get(
        'https://api.ring.com/clients_api/some_endpoint',
        ({ request: req }) => {
          const authHeader = req.headers.get('Authorization')
          if (
            invalidateFirstAccessToken &&
            authHeader === `Bearer ${accessToken}`
          ) {
            // Original access token used, but no longer valid
            return HttpResponse.json({}, { status: 401 })
          }

          if (
            authHeader !== `Bearer ${accessToken}` &&
            authHeader !== `Bearer ${secondAccessToken}`
          ) {
            // Invalid access token used
            return HttpResponse.json({}, { status: 401 })
          }

          if (sessionCreatedCount === 0) {
            // Session not created yet
            return HttpResponse.json(
              {
                error:
                  'Session not found for ' + req.headers.get('hardware_id'),
              },
              { status: 404 },
            )
          }

          return HttpResponse.json([])
        },
      ),
    )
  })

  it('should include the auth token as a header', async () => {
    client = new RingRestClient({
      refreshToken,
    })
    const response = await client.request({
      url: 'https://api.ring.com/clients_api/some_endpoint',
    })

    expect(response).toEqual([])
  })

  it('should fetch a new auth token if the first is no longer valid', async () => {
    client = new RingRestClient({
      refreshToken,
    })

    invalidateFirstAccessToken = true
    const response = await client.request({
      url: 'https://api.ring.com/clients_api/some_endpoint',
    })

    expect(response).toEqual([])
  })
})
