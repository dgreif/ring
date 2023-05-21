import { rest } from 'msw'
import { setupServer } from 'msw/node'
import { RingRestClient } from '../rest-client'
import { getHardwareId } from '../util'

const email = 'some@one.com',
  password = 'abc123!',
  phone = '+1xxxxxxxx89',
  twoFactorAuthCode = '123456',
  hardwareIdPromise = getHardwareId(),
  accessToken = 'ey__accees_token',
  refreshToken = 'ey__refresh_token',
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
})
