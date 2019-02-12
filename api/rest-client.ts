import axios, { AxiosRequestConfig } from 'axios'
import { delay, logError, logInfo } from './util'
import * as querystring from 'querystring'

const ringErrorCodes: { [code: number]: string } = {
  7050: 'NO_ASSET',
  7019: 'ASSET_OFFLINE',
  7061: 'ASSET_CELL_BACKUP',
  7062: 'UPDATING',
  7063: 'MAINTENANCE'
}

async function requestWithRetry<T>(options: AxiosRequestConfig): Promise<T> {
  try {
    logInfo(`Making request: ${JSON.stringify(options, null, 2)}`)
    const response = await axios(options)
    return response.data as T
  } catch (e) {
    if (!e.response) {
      logError(
        `Failed to reach Ring server at ${
          options.url
        }.  Trying again in 5 seconds...`
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

  async request<T = void>(
    method: 'GET' | 'POST',
    url: string,
    data?: any
  ): Promise<T> {
    const token = await this.authTokenPromise
    const headers = {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Bearer ${token}`
    }

    try {
      return await requestWithRetry<T>({
        method,
        url,
        data: querystring.stringify(data),
        headers
      })
    } catch (e) {
      const response = e.response || {}

      if (response.status === 401) {
        this.authTokenPromise = this.getAuthToken()
        return this.request(method, url, data)
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
          return this.request(method, url, data)
        } else {
          logError(
            `http request failed.  ${url} returned unknown errors: (${errors}).  Trying again in 20 seconds`
          )
        }
      }

      logError(`Request to ${url} failed`)

      throw e
    }
  }
}
