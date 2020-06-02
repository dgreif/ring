import got, { Options, Headers } from 'got'
import CacheableLookup from 'cacheable-lookup'
import HttpAgent, { HttpsAgent } from 'agentkeepalive'
import { delay, getHardwareId, logError, logInfo, stringify } from './util'
import { AuthTokenResponse, SessionResponse } from './ring-types'
import { ReplaySubject } from 'rxjs'

const defaultOptions: Options = {
    headers: { 'user-agent': 'Device' },
    dnsCache: new CacheableLookup(),
    agent: { http: new HttpAgent(), https: new HttpsAgent() },
    http2: true,
    responseType: 'json',
    method: 'GET',
  },
  ringErrorCodes: { [code: number]: string } = {
    7050: 'NO_ASSET',
    7019: 'ASSET_OFFLINE',
    7061: 'ASSET_CELL_BACKUP',
    7062: 'UPDATING',
    7063: 'MAINTENANCE',
  },
  clientApiBaseUrl = 'https://api.ring.com/clients_api/',
  appApiBaseUrl = 'https://app.ring.com/api/v1/',
  apiVersion = 11,
  hardwareIdPromise = getHardwareId()

export function clientApi(path: string) {
  return clientApiBaseUrl + path
}

export function appApi(path: string) {
  return appApiBaseUrl + path
}

export interface ExtendedResponse {
  responseTimestamp: number
}

async function requestWithRetry<T>(
  reqOptions: Options
): Promise<T & ExtendedResponse> {
  try {
    const options = { ...defaultOptions, ...reqOptions },
      { headers, body } = (await got(options)) as {
        headers: Headers
        body: any
      },
      data = body as T & ExtendedResponse
    if (data !== null && typeof data === 'object' && headers.date) {
      data.responseTimestamp = new Date(headers.date as string).getTime()
    }
    return data
  } catch (e) {
    if (!e.response) {
      logError(
        `Failed to reach Ring server at ${reqOptions.url}.  Trying again in 5 seconds...`
      )
      await delay(5000)
      return requestWithRetry(reqOptions)
    }
    throw e
  }
}

export interface EmailAuth {
  email: string
  password: string
}

export interface RefreshTokenAuth {
  refreshToken: string
}

export interface SessionOptions {
  controlCenterDisplayName?: string
}

export class RingRestClient {
  // prettier-ignore
  public refreshToken = ('refreshToken' in this.authOptions ? this.authOptions.refreshToken : undefined)
  private authPromise = this.getAuth()
  private sessionPromise = this.getSession()
  public using2fa = false
  public onRefreshTokenUpdated = new ReplaySubject<{
    oldRefreshToken?: string
    newRefreshToken: string
  }>(1)

  constructor(
    private authOptions: (EmailAuth | RefreshTokenAuth) & SessionOptions
  ) {}

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
          hardware_id: await hardwareIdPromise,
        },
      })

      this.onRefreshTokenUpdated.next({
        oldRefreshToken: this.refreshToken,
        newRefreshToken: response.refresh_token,
      })
      this.refreshToken = response.refresh_token

      return response
    } catch (requestError) {
      if (grantData.refresh_token) {
        // failed request with refresh token, try again with username/password
        this.refreshToken = undefined
        return this.getAuth()
      }

      const response = requestError.response || {},
        responseData = response.body || {},
        responseError =
          typeof responseData.error === 'string' ? responseData.error : ''

      if (
        response.statusCode === 412 || // need 2fa code
        (response.statusCode === 400 &&
          responseError.startsWith('Verification Code')) // invalid 2fa code entered
      ) {
        this.using2fa = true
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
          (responseData.error_description ===
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
          hardware_id: await hardwareIdPromise,
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
      } catch (e) {
        const response = e.response || {}

        if (response.statusCode === 401) {
          this.refreshAuth()
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

  private refreshAuth() {
    this.authPromise = this.getAuth()
  }

  private refreshSession() {
    this.sessionPromise = this.getSession()
  }

  async request<T = void>(options: Options): Promise<T & ExtendedResponse> {
    const hardwareId = await hardwareIdPromise,
      url = options.url! as string

    try {
      await this.sessionPromise
      const authTokenResponse = await this.authPromise
      options.headers = {
        ...options.headers,
        ...{
          authorization: `Bearer ${authTokenResponse.access_token}`,
          hardware_id: hardwareId,
        },
      }

      return await requestWithRetry<T>(options)
    } catch (e) {
      const response = e.response || {}

      if (response.statusCode === 401) {
        this.refreshAuth()
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
          this.refreshSession()
          return this.request(options)
        }

        throw new Error('Not found with response: ' + stringify(response.body))
      }

      logError(
        `Request to ${url} failed with status ${
          response.statusCode
        }. Response body: ${stringify(response.body)}`
      )

      throw e
    }
  }

  getCurrentAuth() {
    return this.authPromise
  }
}
