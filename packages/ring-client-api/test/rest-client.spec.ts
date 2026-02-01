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
} from 'vitest'

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
  server = setupServer(
    http.post(
      'https://oauth.ring.com/oauth/token',
      async ({ request: req }) => {
        const body: any = await req.json()

        if (
          req.headers.get('2fa-support') !== 'true' ||
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

        if (
          body.grant_type !== 'password' ||
          body.client_id !== 'ring_official_android' ||
          body.scope !== 'client'
        ) {
          return HttpResponse.json(
            {
              code: 1,
              error: 'Invalid auth request: ' + JSON.stringify(body),
            },
            { status: 400 },
          )
        }

        if (body.username !== email || body.password !== password) {
          // Wrong username or password
          return HttpResponse.json(
            {
              error: 'access_denied',
              error_description: 'invalid user credentials',
            },
            { status: 401 },
          )
        }

        if (
          req.headers.get('2fa-code') &&
          req.headers.get('2fa-code') !== twoFactorAuthCode
        ) {
          // Wrong 2fa code
          return HttpResponse.json(
            {
              err_msg: 'bad request response from dependency service',
              error: 'Verification Code is invalid or expired',
            },
            { status: 400 },
          )
        }

        if (req.headers.get('2fa-code') === twoFactorAuthCode) {
          // Successfull login with correct 2fa code
          return HttpResponse.json({
            access_token: accessToken,
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: 'client',
            token_type: 'Bearer',
            responseTimestamp: Date.now(),
          })
        }

        // 2fa code not provided, so return the 2fa prompt
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
  client.clearTimeouts()
  clearTimeouts()
  server.resetHandlers()
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
      'Failed to fetch oauth token from Ring. Verify that your email and password are correct. (error: access_denied)',
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

  it('should clear refresh token only on invalid_grant error', async () => {
    const invalidToken = 'invalid_token'
    client = new RingRestClient({
      refreshToken: invalidToken,
    })

    // The invalid token should be cleared when it gets a 401 invalid_grant response
    // Because there's no email/password, it will fall back to throwing the error from getGrantData
    await expect(() => client.getAuth()).rejects.toThrow(
      'Refresh token is not valid.  Unable to authenticate with Ring servers',
    )

    // Verify the token was cleared
    expect(client.refreshToken).toBeUndefined()
  })

  it('should NOT clear refresh token on server errors', async () => {
    const validToken = await wrapRefreshToken(refreshToken)
    client = new RingRestClient({
      refreshToken: validToken,
    })

    // Mock a server error
    server.use(
      http.post('https://oauth.ring.com/oauth/token', () => {
        // Simulate 503 Service Unavailable
        return HttpResponse.json(
          { error: 'service_unavailable' },
          { status: 503 },
        )
      }),
    )

    // Should throw an error but NOT clear the token
    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring',
    )

    // Verify the token was NOT cleared
    expect(client.refreshToken).toBe(validToken)
  })

  it('should NOT clear refresh token on rate limiting errors', async () => {
    const validToken = await wrapRefreshToken(refreshToken)
    client = new RingRestClient({
      refreshToken: validToken,
    })

    // Mock a rate limiting error
    server.use(
      http.post('https://oauth.ring.com/oauth/token', () => {
        // Simulate 429 Too Many Requests
        return HttpResponse.json(
          { error: 'rate_limit_exceeded' },
          { status: 429 },
        )
      }),
    )

    // Should throw an error but NOT clear the token
    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring',
    )

    // Verify the token was NOT cleared - this is critical for recovery from temporary issues
    expect(client.refreshToken).toBe(validToken)
  })

  it('should NOT clear refresh token on access_denied from non-401 status', async () => {
    const validToken = await wrapRefreshToken(refreshToken)
    client = new RingRestClient({
      refreshToken: validToken,
    })

    // Mock an error that has access_denied but not 401 status
    server.use(
      http.post('https://oauth.ring.com/oauth/token', () => {
        return HttpResponse.json({ error: 'access_denied' }, { status: 403 })
      }),
    )

    // Should throw an error but NOT clear the token (only 401 + invalid_grant/access_denied should clear)
    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring',
    )

    // Verify the token was NOT cleared
    expect(client.refreshToken).toBe(validToken)
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
