import axios, { AxiosRequestConfig, ResponseType } from 'axios'
import { delay, generateRandomId, logError, logInfo } from './util'
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

export class RingRestClient {
  private authPromise = this.getAuthToken()
  private sessionPromise = this.getSession()

  constructor(private email: string, private password: string) {}

  private async getAuthToken() {
    try {
      const response = await requestWithRetry<AuthTokenResponse>({
        url: 'https://oauth.ring.com/oauth/token',
        data: {
          client_id: 'ring_official_android',
          grant_type: 'password',
          password: this.password,
          username: this.email,
          scope: 'client'
        },
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        }
      })

      return response
    } catch (requestError) {
      const errorMessage =
        'Failed to fetch oauth token from Ring.  Verify that your email and password are correct.'
      logError(requestError)
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
