import got, { Options as RequestOptions, Headers } from 'got'
import {
  delay,
  getHardwareId,
  logDebug,
  logError,
  logInfo,
  stringify,
} from './util'
import {
  Auth2faResponse,
  AuthTokenResponse,
  SessionResponse,
} from './ring-types'
import { ReplaySubject } from 'rxjs'

const defaultRequestOptions: RequestOptions = {
    responseType: 'json',
    method: 'GET',
    retry: 0,
    timeout: 20000,
  },
  ringErrorCodes: { [code: number]: string } = {
    7050: 'NO_ASSET',
    7019: 'ASSET_OFFLINE',
    7061: 'ASSET_CELL_BACKUP',
    7062: 'UPDATING',
    7063: 'MAINTENANCE',
  },
  clientApiBaseUrl = 'https://api.ring.com/clients_api/',
  deviceApiBaseUrl = 'https://api.ring.com/devices/v1/',
  appApiBaseUrl = 'https://app.ring.com/api/v1/',
  apiVersion = 11

export function clientApi(path: string) {
  return clientApiBaseUrl + path
}

export function deviceApi(path: string) {
  return deviceApiBaseUrl + path
}

export function appApi(path: string) {
  return appApiBaseUrl + path
}

export interface ExtendedResponse {
  responseTimestamp: number
}

async function requestWithRetry<T>(
  requestOptions: RequestOptions & { url: string }
): Promise<T & ExtendedResponse> {
  try {
    const options = {
        ...defaultRequestOptions,
        ...requestOptions,
      },
      { headers, body } = (await got(options)) as {
        headers: Headers
        body: any
      },
      data = body as T & ExtendedResponse
    if (data !== null && typeof data === 'object' && headers.date) {
      data.responseTimestamp = new Date(headers.date as string).getTime()
    }
    return data
  } catch (e: any) {
    if (!e.response) {
      logError(
        `Failed to reach Ring server at ${requestOptions.url}.  ${e.message}.  Trying again in 5 seconds...`
      )
      if (e.message.includes('NGHTTP2_ENHANCE_YOUR_CALM')) {
        logError(
          `There is a known issue with your current NodeJS version (${process.version}).  Please see https://github.com/dgreif/ring/wiki/NGHTTP2_ENHANCE_YOUR_CALM-Error for details`
        )
      }
      logDebug(e)

      await delay(5000)
      return requestWithRetry(requestOptions)
    }
    throw e
  }
}

export interface EmailAuth {
  email: string
  password: string
  systemId?: string
}

export interface RefreshTokenAuth {
  refreshToken: string
  systemId?: string
}

export interface SessionOptions {
  controlCenterDisplayName?: string
}

export class RingRestClient {
  // prettier-ignore
  public refreshToken
  private hardwareIdPromise
  private _authPromise: Promise<AuthTokenResponse> | undefined
  private timeouts: ReturnType<typeof setTimeout>[] = []
  private clearPreviousAuth() {
    this._authPromise = undefined
  }
  private get authPromise() {
    if (!this._authPromise) {
      const authPromise = this.getAuth()
      this._authPromise = authPromise

      authPromise
        .then(({ expires_in }) => {
          // clear the existing auth promise 1 minute before it expires
          const timeout = setTimeout(() => {
            if (this._authPromise === authPromise) {
              this.clearPreviousAuth()
            }
          }, ((expires_in || 3600) - 60) * 1000)
          this.timeouts.push(timeout)
        })
        .catch(() => {
          // ignore these errors here, they should be handled by the function making a rest request
        })
    }

    return this._authPromise
  }
  private sessionPromise?: Promise<SessionResponse> = undefined
  public using2fa = false
  public promptFor2fa?: string
  public onRefreshTokenUpdated = new ReplaySubject<{
    oldRefreshToken?: string
    newRefreshToken: string
  }>(1)

  constructor(
    private authOptions: (EmailAuth | RefreshTokenAuth) & SessionOptions
  ) {
    this.refreshToken =
      'refreshToken' in this.authOptions
        ? this.authOptions.refreshToken
        : undefined
    this.hardwareIdPromise = getHardwareId(this.authOptions.systemId)
  }

  private getGrantData(twoFactorAuthCode?: string) {
    if (this.refreshToken && !twoFactorAuthCode) {
      return {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }
    }

    const { authOptions } = this
    if ('email' in authOptions) {
      return {
        grant_type: 'password',
        password: authOptions.password,
        username: authOptions.email,
      }
    }

    throw new Error(
      'Refresh token is not valid.  Unable to authenticate with Ring servers.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens'
    )
  }

  async getAuth(twoFactorAuthCode?: string): Promise<AuthTokenResponse> {
    const grantData = this.getGrantData(twoFactorAuthCode)

    try {
      const response = await requestWithRetry<AuthTokenResponse>({
        url: 'https://oauth.ring.com/oauth/token',
        json: {
          client_id: 'ring_official_android',
          scope: 'client',
          ...grantData,
        },
        method: 'POST',
        headers: {
          '2fa-support': 'true',
          '2fa-code': twoFactorAuthCode || '',
          hardware_id: await this.hardwareIdPromise,
        },
      })

      this.onRefreshTokenUpdated.next({
        oldRefreshToken: this.refreshToken,
        newRefreshToken: response.refresh_token,
      })
      this.refreshToken = response.refresh_token

      return response
    } catch (requestError: any) {
      if (grantData.refresh_token) {
        // failed request with refresh token
        this.refreshToken = undefined
        logError(requestError)
        return this.getAuth()
      }

      const response = requestError.response || {},
        responseData: Auth2faResponse = response.body || {},
        responseError =
          'error' in responseData && typeof responseData.error === 'string'
            ? responseData.error
            : ''

      if (
        response.statusCode === 412 || // need 2fa code
        (response.statusCode === 400 &&
          responseError.startsWith('Verification Code')) // invalid 2fa code entered
      ) {
        this.using2fa = true

        if ('tsv_state' in responseData) {
          const { tsv_state, phone } = responseData,
            prompt =
              tsv_state === 'totp'
                ? 'from your authenticator app'
                : `sent to ${phone} via ${tsv_state}`

          this.promptFor2fa = `Please enter the code ${prompt}`
        } else {
          this.promptFor2fa = 'Please enter the code sent to your text/email'
        }

        throw new Error(
          'Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.'
        )
      }

      const authTypeMessage =
          'refreshToken' in this.authOptions
            ? 'refresh token is'
            : 'email and password are',
        errorMessage =
          'Failed to fetch oauth token from Ring. ' +
          ('error_description' in responseData &&
          responseData.error_description ===
            'too many requests from dependency service'
            ? 'You have requested too many 2fa codes.  Ring limits 2fa to 10 codes within 10 minutes.  Please try again in 10 minutes.'
            : `Verify that your ${authTypeMessage} correct.`) +
          ` (error: ${responseError})`
      logError(requestError.response || requestError)
      logError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  private async fetchNewSession(authToken: AuthTokenResponse) {
    return requestWithRetry<SessionResponse>({
      url: clientApi('session'),
      json: {
        device: {
          hardware_id: await this.hardwareIdPromise,
          metadata: {
            api_version: apiVersion,
            device_model:
              this.authOptions.controlCenterDisplayName ?? 'ring-client-api',
          },
          os: 'android', // can use android, ios, ring-site, windows for sure
        },
      },
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken.access_token}`,
      },
    })
  }

  getSession(): Promise<SessionResponse> {
    return this.authPromise.then(async (authToken) => {
      try {
        return await this.fetchNewSession(authToken)
      } catch (e: any) {
        const response = e.response || {}

        if (response.statusCode === 401) {
          await this.refreshAuth()
          return this.getSession()
        }

        if (response.statusCode === 429) {
          const retryAfter = e.response.headers['retry-after'],
            waitSeconds = isNaN(retryAfter)
              ? 200
              : Number.parseInt(retryAfter, 10)

          logError(
            `Session response rate limited. Waiting to retry after ${waitSeconds} seconds`
          )
          await delay((waitSeconds + 1) * 1000)

          logInfo('Retrying session request')
          return this.getSession()
        }
        throw e
      }
    })
  }

  private async refreshAuth() {
    this.clearPreviousAuth()
    await this.authPromise
  }

  private refreshSession() {
    this.sessionPromise = this.getSession()
  }

  async request<T = void>(
    options: RequestOptions & { url: string }
  ): Promise<T & ExtendedResponse> {
    const hardwareId = await this.hardwareIdPromise,
      url = options.url! as string,
      initialSessionPromise = this.sessionPromise

    try {
      await initialSessionPromise
      const authTokenResponse = await this.authPromise

      return await requestWithRetry<T>({
        ...options,
        headers: {
          ...options.headers,
          authorization: `Bearer ${authTokenResponse.access_token}`,
          hardware_id: hardwareId,
          'User-Agent': 'android:com.ringapp',
        },
      })
    } catch (e: any) {
      const response = e.response || {}

      if (response.statusCode === 401) {
        await this.refreshAuth()
        return this.request(options)
      }

      if (response.statusCode === 504) {
        // Gateway Timeout.  These should be recoverable, but wait a few seconds just to be on the safe side
        await delay(5000)
        return this.request(options)
      }

      if (
        response.statusCode === 404 &&
        response.body &&
        Array.isArray(response.body.errors)
      ) {
        const errors = response.body.errors,
          errorText = errors
            .map((code: number) => ringErrorCodes[code])
            .filter((x?: string) => x)
            .join(', ')

        if (errorText) {
          logError(
            `http request failed.  ${url} returned errors: (${errorText}).  Trying again in 20 seconds`
          )

          await delay(20000)
          return this.request(options)
        }
        logError(
          `http request failed.  ${url} returned unknown errors: (${stringify(
            errors
          )}).`
        )
      }

      if (response.statusCode === 404 && url.startsWith(clientApiBaseUrl)) {
        logError('404 from endpoint ' + url)
        if (response.body?.error?.includes(hardwareId)) {
          logError(
            'Session hardware_id not found.  Creating a new session and trying again.'
          )
          if (this.sessionPromise === initialSessionPromise) {
            this.refreshSession()
          }
          return this.request(options)
        }

        throw new Error('Not found with response: ' + stringify(response.body))
      }

      if (response.statusCode) {
        logError(
          `Request to ${url} failed with status ${
            response.statusCode
          }. Response body: ${stringify(response.body)}`
        )
      } else {
        logError(`Request to ${url} failed:`)
        logError(e)
      }

      throw e
    }
  }

  getCurrentAuth() {
    return this.authPromise
  }

  clearTimeouts() {
    this.timeouts.forEach(clearTimeout)
  }
}
