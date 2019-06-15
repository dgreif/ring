import axios, { AxiosRequestConfig, ResponseType } from 'axios'
import { delay, logError, logInfo } from './util'
import * as querystring from 'querystring'

const ringErrorCodes: { [code: number]: string } = {
  7050: 'NO_ASSET',
  7019: 'ASSET_OFFLINE',
  7061: 'ASSET_CELL_BACKUP',
  7062: 'UPDATING',
  7063: 'MAINTENANCE'
}

const clientApiBaseUrl = 'https://api.ring.com/clients_api/'

export function clientApi(path: string) {
  return clientApiBaseUrl + path
}

async function requestWithRetry<T>(options: AxiosRequestConfig): Promise<T> {
  try {
    logInfo(`Making request: ${JSON.stringify(options, null, 2)}`)
    const response = await axios(options)
    return response.data as T
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

export class RingRestClient {
  private authTokenPromise = this.getAuthToken()

  constructor(private email: string, private password: string) {}

  private async getAuthToken() {
    try {
      const response = await requestWithRetry<{ access_token: string }>({
        url: 'https://oauth.ring.com/oauth/token',
        data: {
          client_id: 'ring_official_android',
          grant_type: 'password',
          password: this.password,
          username: this.email,
          scope: 'client'
        },
        method: 'POST'
      })

      return response.access_token as string
    } catch (requestError) {
      const errorMessage =
        'Failed to fetch oauth token from Ring.  Verify that your email and password are correct.'
      logError(requestError)
      logError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  async request<T = void>(options: {
    method?: 'GET' | 'POST' | 'PUT'
    url: string
    data?: any
    json?: boolean
    responseType?: ResponseType
  }): Promise<T> {
    const token = await this.authTokenPromise,
      { method, url, data, json, responseType } = options,
      headers = {
        'content-type': json
          ? 'application/json'
          : 'application/x-www-form-urlencoded',
        authorization: `Bearer ${token}`,
        'user-agent': 'android:com.ringapp:2.0.67(423)' // required to get active dings
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
        this.authTokenPromise = this.getAuthToken()
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

      logError(`Request to ${url} failed`)

      throw e
    }
  }
}
