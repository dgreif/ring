/* eslint-disable no-console */
import { RingRestClient } from './rest-client'
import { requestInput } from './util'
import { AuthTokenResponse } from './ring-types'

export async function acquireRefreshToken() {
  const email = await requestInput('Email: '),
    password = await requestInput('Password: '),
    restClient = new RingRestClient({ email, password }),
    getAuthWith2fa = async (): Promise<any> => {
      const code = await requestInput('2fa Code: ')
      try {
        return await restClient.getAuth(code)
      } catch (_) {
        console.log('Incorrect 2fa code. Please try again.')
        return getAuthWith2fa()
      }
    },
    auth: AuthTokenResponse = await restClient.getCurrentAuth().catch((e) => {
      if (restClient.using2fa) {
        console.log(
          'Ring 2fa or verification code is enabled.  Please enter code from the text/email.'
        )
        return getAuthWith2fa()
      }

      console.error(e)
      process.exit(1)
    })

  return auth.refresh_token
}

export async function logRefreshToken() {
  console.log(
    'This CLI will provide you with a refresh token which you can use to configure ring-client-api and homebridge-ring.'
  )

  const refreshToken = await acquireRefreshToken()

  console.log(
    '\nSuccessfully logged in to Ring. Please add the following to your config:\n'
  )
  console.log(`"refreshToken": "${refreshToken}"`)
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
process.on('unhandledRejection', () => {})
