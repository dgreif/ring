import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { RingRestClient } from '../rest-client.ts'
import { clearTimeouts, getHardwareId, toBase64 } from '../util.ts'
import { firstValueFrom } from 'rxjs'
import { createHash } from 'crypto'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

let sessionCreatedCount = 0,
  client: RingRestClient,
  // Tracks whether the PKCE signin flow has been authenticated (simulates session cookies)
  pkceAuthenticated = false,
  // Stores the code_challenge from the initial authorize request for PKCE verification
  storedCodeChallenge = '',
  // Stores the state from the initial authorize request so it can be returned after auth
  storedState = ''

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
  authorizationCode = 'test_auth_code_12345',
  csrfToken = 'test-csrf-token-abc',
  server = setupServer(
    // GET /oauth/v2/authorize — Initiates or completes the OAuth PKCE flow
    http.get(
      'https://oauth.ring.com/oauth/v2/authorize',
      ({ request: req }) => {
        const url = new URL(req.url)
        const codeChallenge = url.searchParams.get('code_challenge')
        const state = url.searchParams.get('state')

        if (pkceAuthenticated) {
          // After successful signin/2FA, return 302 with authorization code
          // Use the stored state from the initial authorize call (second call may not have params)
          return new HttpResponse(null, {
            status: 302,
            headers: {
              Location: `https://ring.com/signin/callback?code=${authorizationCode}&state=${storedState}`,
            },
          })
        }

        // First call — store the code_challenge and state, then redirect to signin
        if (codeChallenge) {
          storedCodeChallenge = codeChallenge
        }
        if (state) {
          storedState = state
        }

        return new HttpResponse(null, {
          status: 302,
          headers: {
            Location: '/oauth/v2/signin',
            'Set-Cookie': 'ring_session=test-session; Path=/',
          },
        })
      },
    ),

    // GET /oauth/v2/signin — Returns the signin page with CSRF token
    http.get('https://oauth.ring.com/oauth/v2/signin', () => {
      return new HttpResponse(
        `<!DOCTYPE html>
<html>
<head><title>Ring Sign In</title></head>
<body>
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"csrfToken":"${csrfToken}"}}}</script>
</body>
</html>`,
        {
          headers: {
            'Content-Type': 'text/html',
            'Set-Cookie': 'ring_session=test-session; Path=/',
          },
        },
      )
    }),

    // POST /oauth/v2/signin — Submit credentials
    http.post(
      'https://oauth.ring.com/oauth/v2/signin',
      async ({ request: req }) => {
        const body = await req.text()
        const params = new URLSearchParams(body)

        const submittedCsrf = params.get('csrf-token')
        if (submittedCsrf !== csrfToken) {
          return HttpResponse.json(
            { error: 'Invalid CSRF token' },
            { status: 403 },
          )
        }

        const submittedEmail = params.get('username')
        const submittedPassword = params.get('password')

        if (submittedEmail !== email || submittedPassword !== password) {
          // Wrong credentials
          return HttpResponse.json(
            { error: 'access_denied' },
            { status: 401 },
          )
        }

        // Correct credentials — return 412 requiring 2FA
        return HttpResponse.json(
          {
            next_time_in_secs: 60,
            phone,
            tsv_state: 'sms',
          },
          {
            status: 412,
            headers: {
              'Set-Cookie': 'ring_session=test-session-authed; Path=/',
            },
          },
        )
      },
    ),

    // POST /oauth/v2/2fa/verify — Verify 2FA code
    http.post(
      'https://oauth.ring.com/oauth/v2/2fa/verify',
      async ({ request: req }) => {
        const body = await req.text()
        const params = new URLSearchParams(body)

        const code = params.get('2fa_code')

        if (code !== twoFactorAuthCode) {
          // Wrong 2FA code
          return HttpResponse.json(
            { error: 'Verification Code is invalid or expired' },
            { status: 400 },
          )
        }

        // Correct 2FA code — mark as authenticated
        pkceAuthenticated = true
        return HttpResponse.json(
          {
            redirect_url: '/oauth/v2/authorize',
            status: 'auth-completed',
            user_id: 9463336,
          },
          {
            status: 201,
            headers: {
              'Set-Cookie':
                'ring_session=test-session-2fa-verified; Path=/',
            },
          },
        )
      },
    ),

    // POST /oauth/token — Token exchange (authorization_code or refresh_token)
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
                'Invalid auth headers',
            },
            { status: 400 },
          )
        }

        const bodyText = await req.text()
        const params = new URLSearchParams(bodyText)
        const grantType = params.get('grant_type')

        if (grantType === 'authorization_code') {
          const code = params.get('code')
          const codeVerifier = params.get('code_verifier')
          const clientId = params.get('client_id')

          if (code !== authorizationCode || clientId !== 'ring_official_android') {
            return HttpResponse.json(
              { error: 'invalid_grant' },
              { status: 400 },
            )
          }

          // Verify PKCE: SHA256(code_verifier) should equal the stored code_challenge
          if (codeVerifier && storedCodeChallenge) {
            const computedChallenge = createHash('sha256')
              .update(codeVerifier)
              .digest('base64url')
            if (computedChallenge !== storedCodeChallenge) {
              return HttpResponse.json(
                { error: 'invalid_grant', error_description: 'PKCE verification failed' },
                { status: 400 },
              )
            }
          }

          return HttpResponse.json({
            access_token: accessToken,
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: 'client',
            token_type: 'Bearer',
          })
        }

        if (grantType === 'refresh_token') {
          const rt = params.get('refresh_token')

          if (rt === refreshToken) {
            return HttpResponse.json({
              access_token: accessToken,
              expires_in: 3600,
              refresh_token: secondRefreshToken,
              scope: 'client',
              token_type: 'Bearer',
            })
          }

          if (rt === secondRefreshToken) {
            return HttpResponse.json({
              access_token: secondAccessToken,
              expires_in: 3600,
              refresh_token: thirdRefreshToken,
              scope: 'client',
              token_type: 'Bearer',
            })
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

        return HttpResponse.json(
          { error: 'unsupported_grant_type' },
          { status: 400 },
        )
      },
    ),

    // POST /clients_api/session — Session creation
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
  pkceAuthenticated = false
  storedCodeChallenge = ''
  storedState = ''
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
      'Failed to fetch oauth token from Ring. Verify that your email and password are correct.',
    )
  })

  it('should handle invalid 2fa code', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    // ignore the first reject, it triggers 2fa prompt
    await expect(() => client.getAuth()).rejects.toThrow()

    // call getAuth again with an invalid 2fa code, which should fail
    await expect(() => client.getAuth('invalid 2fa code')).rejects.toThrow(
      'Verification Code is invalid or expired',
    )
    expect(client.promptFor2fa).toEqual(
      'Invalid 2fa code entered.  Please try again.',
    )
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

  it('should verify PKCE code_verifier matches code_challenge', async () => {
    client = new RingRestClient({
      password,
      email,
    })

    // First call triggers 2FA
    await expect(() => client.getAuth()).rejects.toThrow()

    // Second call with valid 2FA code should succeed with valid PKCE verification
    const auth = await client.getAuth(twoFactorAuthCode)
    expect(auth.access_token).toEqual(accessToken)

    // Verify that a code_challenge was stored by the mock (meaning PKCE params were sent)
    expect(storedCodeChallenge).toBeTruthy()
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
