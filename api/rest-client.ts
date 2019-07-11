import axios, { AxiosRequestConfig, ResponseType } from 'axios'
import {
  delay,
  generateRandomId,
  logError,
  logInfo,
  requestInput
} from './util'
import * as querystring from 'querystring'
import { AuthTokenResponse, SessionResponse } from './ring-types'

const ringErrorCodes: { [code: number]: string } = {
    7050: 'NO_ASSET',
    7019: 'ASSET_OFFLINE',
    7061: 'ASSET_CELL_BACKUP',
    7062: 'UPDATING',
    7063: 'MAINTENANCE'
  },
  clientApiBaseUrl = 'https://api.ring.com/clients_api/',
  apiVersion = 11

export function clientApi(path: string) {
  return clientApiBaseUrl + path
}

export interface ExtendedResponse {
  responseTimestamp: number
}

async function requestWithRetry<T>(
  options: AxiosRequestConfig
): Promise<T & ExtendedResponse> {
  try {
    logInfo(`Making request: ${JSON.stringify(options, null, 2)}`)
    const { data, headers } = await axios(options)

    if (typeof data === 'object' && headers.date) {
      data.responseTimestamp = new Date(headers.date).getTime()
    }

    return data as T & ExtendedResponse
  } catch (e) {
    if (!e.response) {
      logError(
        `Failed to reach Ring server at ${options.url}.  Trying again in 5 seconds...`
      )
      await delay(5000)
      return requestWithRetry(options)
    }

    throw e
  }
}

interface Session {
  hardwareId: string
}

export interface EmailAuth {
  email: string
  password: string
}

export interface RefreshTokenAuth {
  refreshToken: string
}

export type RingAuth = EmailAuth | RefreshTokenAuth

export class RingRestClient {
  // prettier-ignore
  public refreshToken = ('refreshToken' in this.authOptions ? this.authOptions.refreshToken : undefined)
  private authPromise = this.getAuthToken()
  private sessionPromise = this.getSession()
  public using2fa = false

  constructor(private authOptions: RingAuth) {}

  private getGrantData(twoFactorAuthCode?: string) {
    if (this.refreshToken && !twoFactorAuthCode) {
      return {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      }
    }

    const { authOptions } = this
    if ('email' in authOptions) {
      return {
        grant_type: 'password',
        password: authOptions.password,
        username: authOptions.email
      }
    }

    throw new Error(
      'Refresh token is not valid.  Unable to authenticate with Ring servers.'
    )
  }

  private async getAuthToken(
    twoFactorAuthCode?: string
  ): Promise<AuthTokenResponse> {
    const grantData = this.getGrantData(twoFactorAuthCode)

    try {
      const response = await requestWithRetry<AuthTokenResponse>({
        url: 'https://oauth.ring.com/oauth/token',
        data: {
          client_id: 'ring_official_android',
          scope: 'client',
          ...grantData
        },
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          '2fa-support': 'true',
          '2fa-code': twoFactorAuthCode || ''
        }
      })

      this.refreshToken = response.refresh_token

      return response
    } catch (requestError) {
      if (grantData.refresh_token) {
        // failed request with refresh token, try again with username/password
        this.refreshToken = undefined
        return this.getAuthToken()
      }

      const response = requestError.response || {},
        responseData = response.data || {},
        responseError =
          typeof responseData.error === 'string' ? responseData.error : ''

      if (
        response.status === 412 || // need 2fa code
        (response.status === 400 &&
          responseError.startsWith('Verification Code')) // invalid 2fa code entered
      ) {
        const code = await requestInput(
          'Ring 2fa enabled.  Please enter code from text message: '
        )
        this.using2fa = true
        return this.getAuthToken(code)
      }

      const authTypeMessage =
          'refreshToken' in this.authOptions
            ? 'refresh token is'
            : 'email and password are',
        errorMessage =
          `Failed to fetch oauth token from Ring. Verify that your ${authTypeMessage} correct. ` +
          responseError
      logError(requestError.response)
      logError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  private async fetchNewSession(
    authToken: AuthTokenResponse
  ): Promise<Session> {
    const hardwareId = generateRandomId()

    await requestWithRetry<SessionResponse>({
      url: clientApi('session'),
      data: {
        device: {
          hardware_id: hardwareId,
          metadata: {
            api_version: apiVersion
          },
          os: 'android'
        }
      },
      method: 'POST',
      headers: {
        authorization: `Bearer ${authToken.access_token}`,
        'content-type': 'application/json'
      }
    })

    return { hardwareId }
  }

  getSession(): Promise<Session> {
    return this.authPromise.then(async authToken => {
      try {
        return await this.fetchNewSession(authToken)
      } catch (e) {
        if (e && e.response && e.response.status === 429) {
          const retryAfter = e.response.headers['retry-after'],
            waitSeconds = isNaN(retryAfter) ? 200 : Number.parseInt(retryAfter)

          logError(
            `Session response rate limited. Waiting to retry for ${waitSeconds} seconds`
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
    this.authPromise = this.getAuthToken()
    this.refreshSession()
  }

  private refreshSession() {
    this.sessionPromise = this.getSession()
  }

  async request<T = void>(options: {
    method?: 'GET' | 'POST' | 'PUT'
    url: string
    data?: any
    json?: boolean
    responseType?: ResponseType
  }): Promise<T & ExtendedResponse> {
    const { method, url, data, json, responseType } = options,
      authTokenResponse = await this.authPromise,
      session = await this.sessionPromise,
      headers: { [key: string]: string } = {
        'content-type': json
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
        authorization: `Bearer ${authTokenResponse.access_token}`,
        hardware_id: session.hardwareId
      }

    try {
      return await requestWithRetry<T>({
        method: method || 'GET',
        url,
        data: json ? data : querystring.stringify(data),
        headers,
        responseType
      })
    } catch (e) {
      const response = e.response || {}

      if (response.status === 401) {
        this.refreshAuth()
        return this.request(options)
      }

      if (
        response.status === 404 &&
        response.data &&
        Array.isArray(response.data.errors)
      ) {
        const errors = response.data.errors,
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
        } else {
          logError(
            `http request failed.  ${url} returned unknown errors: (${errors}).`
          )
        }
      }

      if (response.status === 404 && url.startsWith(clientApiBaseUrl)) {
        logError(
          'Session hardware_id not found.  Creating a new session and trying again.'
        )
        this.refreshSession()
        return this.request(options)
      }

      logError(`Request to ${url} failed`)

      throw e
    }
  }
}
