import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { RingRestClient } from '../rest-client'
import { getHardwareId } from '../util'
import { firstValueFrom } from 'rxjs'

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
    rest.post('https://oauth.ring.com/oauth/token', async (req, res, ctx) => {
      const body = await req.json()

      if (
        req.headers.get('2fa-support') !== 'true' ||
        req.headers.get('User-Agent') !== 'android:com.ringapp' ||
        req.headers.get('hardware_id') !== (await hardwareIdPromise)
      ) {
        return res(
          ctx.status(400),
          ctx.json({
            code: 1,
            error:
              'Invalid auth headers: ' +
              JSON.stringify(req.headers.raw(), null, 2),
          })
        )
      }

      if (body.grant_type === 'refresh_token') {
        if (body.refresh_token === refreshToken) {
          // Valid refresh token
          return res(
            ctx.status(200),
            ctx.json({
              access_token: accessToken,
              expires_in: 3600,
              refresh_token: secondRefreshToken,
              scope: 'client',
              token_type: 'Bearer',
            })
          )
        }

        if (body.refresh_token === secondRefreshToken) {
          // Valid refresh token
          return res(
            ctx.status(200),
            ctx.json({
              access_token: secondAccessToken,
              expires_in: 3600,
              refresh_token: thirdRefreshToken,
              scope: 'client',
              token_type: 'Bearer',
            })
          )
        }

        // Invalid refresh token
        return res(
          ctx.status(401),
          ctx.json({
            error: 'invalid_grant',
            error_description: 'token is invalid or does not exists',
          })
        )
      }

      if (
        body.grant_type !== 'password' ||
        body.client_id !== 'ring_official_android' ||
        body.scope !== 'client'
      ) {
        return res(
          ctx.status(400),
          ctx.json({
            code: 1,
            error: 'Invalid auth request: ' + JSON.stringify(body),
          })
        )
      }

      if (body.username !== email || body.password !== password) {
        // Wrong username or password
        return res(
          ctx.status(401),
          ctx.json({
            error: 'access_denied',
            error_description: 'invalid user credentials',
          })
        )
      }

      if (
        req.headers.get('2fa-code') &&
        req.headers.get('2fa-code') !== twoFactorAuthCode
      ) {
        // Wrong 2fa code
        return res(
          ctx.status(400),
          ctx.json({
            err_msg: 'bad request response from dependency service',
            error: 'Verification Code is invalid or expired',
          })
        )
      }

      if (req.headers.get('2fa-code') === twoFactorAuthCode) {
        // Successfull login with correct 2fa code
        return res(
          ctx.json({
            access_token: accessToken,
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: 'client',
            token_type: 'Bearer',
            responseTimestamp: Date.now(),
          })
        )
      }

      // 2fa code not provided, so return the 2fa prompt
      return res(
        ctx.status(412),
        ctx.json({
          next_time_in_secs: 60,
          phone,
          tsv_state: 'sms',
        })
      )
    })
  )

beforeAll(() => {
  // Establish requests interception layer before all tests.
  server.listen()
})

afterAll(() => {
  // Clean up after all tests are done, preventing this
  // interception layer from affecting irrelevant tests.
  server.close()
})

describe('getAuth', () => {
  test('It should throw and set the 2fa prompt', async () => {
    const client = new RingRestClient({
      password,
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow(
      'Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.'
    )

    expect(client.promptFor2fa).toEqual(
      `Please enter the code sent to ${phone} via sms`
    )
    expect(client.using2fa).toEqual(true)
  })

  test('It should accept a 2fa code', async () => {
    const client = new RingRestClient({
      password,
      email,
    })

    // ignore the first reject, it's tested above
    await expect(() => client.getAuth()).rejects.toThrow()

    // call getAuth again with the 2fa code, which should succeed
    const auth = await client.getAuth(twoFactorAuthCode)
    expect(auth).toMatchObject({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    expect(client.refreshToken).toEqual(refreshToken)
  })

  test('it should handle invalid credentials', async () => {
    const client = new RingRestClient({
      password: 'incorrect password',
      email,
    })

    await expect(() => client.getAuth()).rejects.toThrow(
      'Failed to fetch oauth token from Ring. Verify that your email and password are correct. (error: access_denied)'
    )
  })

  test('it should handle invalid 2fa code', async () => {
    const client = new RingRestClient({
      password,
      email,
    })

    // ignore the first reject, it's tested above
    await expect(() => client.getAuth()).rejects.toThrow()

    // call getAuth again with an invalid 2fa code, which should fail
    await expect(() => client.getAuth('invalid 2fa code')).rejects.toThrow(
      'Verification Code is invalid or expired'
    )
    expect(client.promptFor2fa).toEqual(
      'Invalid 2fa code entered.  Please try again.'
    )
  })

  test('it should establish a valid auth token with a valid refresh token', async () => {
    const client = new RingRestClient({
      refreshToken,
    })

    expect(await client.getCurrentAuth()).toMatchObject({
      access_token: accessToken,
      refresh_token: secondRefreshToken,
    })
    expect(client.refreshToken).toEqual(secondRefreshToken)
  })

  test('it should emit an event when a new refresh token is created', async () => {
    const client = new RingRestClient({
        refreshToken,
      }),
      refreshedPromise = firstValueFrom(client.onRefreshTokenUpdated),
      auth = await client.getAuth()
    expect(auth).toMatchObject({
      access_token: accessToken,
      refresh_token: secondRefreshToken,
    })
    expect(await refreshedPromise).toEqual({
      oldRefreshToken: refreshToken,
      newRefreshToken: secondRefreshToken,
    })
  })
})

describe('fetch', () => {
  let invalidateFirstAccessToken = false

  beforeEach(() => {
    invalidateFirstAccessToken = false
    server.use(
      rest.get('https://api.ring.com/devices/v1/locations', (req, res, ctx) => {
        const authHeader = req.headers.get('Authorization')
        if (
          invalidateFirstAccessToken &&
          authHeader === `Bearer ${accessToken}`
        ) {
          // Original access token used, but no longer valid
          return res(ctx.status(401))
        }

        if (
          authHeader !== `Bearer ${accessToken}` &&
          authHeader !== `Bearer ${secondAccessToken}`
        ) {
          // Invalid access token used
          return res(ctx.status(401))
        }

        return res(ctx.json([]))
      })
    )
  })

  it('should include the auth token as a header', async () => {
    const client = new RingRestClient({
        refreshToken,
      }),
      response = await client.request({
        url: 'https://api.ring.com/devices/v1/locations',
      })

    expect(response).toEqual([])
  })

  it('should fetch a new auth token if the first is no longer valid', async () => {
    const client = new RingRestClient({
      refreshToken,
    })

    invalidateFirstAccessToken = true
    const response = await client.request({
      url: 'https://api.ring.com/devices/v1/locations',
    })

    expect(response).toEqual([])
  })
})
