import {
  delay,
  fromBase64,
  getHardwareId,
  logDebug,
  logError,
  logInfo,
  stringify,
  toBase64,
} from './util.ts'
import {
  Auth2faResponse,
  AuthTokenResponse,
  SessionResponse,
} from './ring-types.ts'
import { ReplaySubject } from 'rxjs'
import assert from 'assert'
import type { Credentials } from '@eneris/push-receiver/dist/types.d.js'
import { Agent } from 'undici'

interface RequestOptions extends RequestInit {
  responseType?: 'json' | 'buffer'
  timeout?: number
  json?: object
  dispatcher?: Agent
}

const fetchAgent = new Agent({
    connections: 6,
    pipelining: 1,
    keepAliveTimeout: 115000,
  }),
  defaultRequestOptions: RequestOptions = {
    responseType: 'json',
    method: 'GET',
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
  commandsApiBaseUrl = 'https://api.ring.com/commands/v1/',
  appApiBaseUrl = 'https://prd-api-us.prd.rings.solutions/api/v1/',
  apiVersion = 11

export function clientApi(path: string) {
  return clientApiBaseUrl + path
}

export function deviceApi(path: string) {
  return deviceApiBaseUrl + path
}

export function commandsApi(path: string) {
  return commandsApiBaseUrl + path
}

export function appApi(path: string) {
  return appApiBaseUrl + path
}

export interface ExtendedResponse {
  responseTimestamp: number
  timeMillis: number
}

interface ResponseError extends Error {
  response: Pick<Response, 'headers' | 'status'> & { body: any }
}

async function responseToError(response: Response) {
  const error = new Error() as ResponseError
  error.response = {
    headers: response.headers,
    status: response.status,
    body: null,
  }

  try {
    const bodyText = await response.text()

    try {
      error.response.body = JSON.parse(bodyText)
    } catch {
      error.response.body = bodyText
    }
  } catch {
    // ignore
  }

  return error
}

async function requestWithRetry<T>(
  requestOptions: RequestOptions & { url: string; allowNoResponse?: boolean },
  retryCount = 0,
): Promise<T & ExtendedResponse> {
  if (typeof fetch !== 'function') {
    throw new Error(
      `Your current NodeJS version (${process.version}) is too old to support this plugin.  Please upgrade to the latest LTS version of NodeJS.`,
    )
  }

  try {
    if (requestOptions.json || requestOptions.responseType === 'json') {
      requestOptions.headers = {
        ...requestOptions.headers,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }

      if (requestOptions.json) {
        requestOptions.body = JSON.stringify(requestOptions.json)
      }
      delete requestOptions.json
    }

    const options = {
      ...defaultRequestOptions,
      ...requestOptions,
      dispatcher: fetchAgent,
    }

    // If a timeout is provided, create an AbortSignal for it
    if (options.timeout && !options.signal) {
      options.signal = AbortSignal.timeout(options.timeout)
    }

    // make the fetch request
    const response = await fetch(options.url, options),
      headers = response.headers

    if (!response.ok) {
      const error = await responseToError(response)
      throw error
    }

    let data: T & ExtendedResponse

    if (options.responseType === 'buffer') {
      const arrayBuffer = await response.arrayBuffer()
      data = Buffer.from(arrayBuffer) as any
    } else {
      const text = await response.text()
      try {
        data = JSON.parse(text)
      } catch {
        data = text as any
      }
    }

    if (data !== null && typeof data === 'object') {
      const date = headers.get('date')
      if (date) {
        data.responseTimestamp = new Date(date).getTime()
      }

      const xTime = headers.get('x-time-millis')
      if (xTime) {
        data.timeMillis = Number(xTime)
      }
    }
    return data
  } catch (e: any) {
    if (!e.response && !requestOptions.allowNoResponse) {
      if (retryCount > 0) {
        let detailedError = `Error: ${e.message}`
        detailedError += e.cause?.message ? `, Cause: ${e.cause.message}` : ''
        detailedError += e.cause?.code ? `, Code: ${e.cause.code}` : ''
        logError(
          `Retry #${retryCount} failed to reach Ring server at ${requestOptions.url}.  ${detailedError}.  Trying again in 5 seconds...`,
        )
        if (e.message.includes('NGHTTP2_ENHANCE_YOUR_CALM')) {
          logError(
            `There is a known issue with your current NodeJS version (${process.version}).  Please see https://github.com/dgreif/ring/wiki/NGHTTP2_ENHANCE_YOUR_CALM-Error for details`,
          )
        }
        logDebug(e)
      }

      await delay(5000)
      return requestWithRetry(requestOptions, retryCount + 1)
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

/**
 * When a "refreshToken" string is created by this client, it contains not only the refresh token needed to auth with
 * Ring servers, but also the hardware id and other information that needs to be stored across usages of the client
 * The Ring refresh token (rt field) will change over time, but the other fields can be carried over between restarts.
 */
interface AuthConfig {
  rt: string // Refresh Token for Auth
  hid?: string // Hardware ID, to stay consistent after initial token creation
  pnc?: Credentials // Push Notification Credentials
}

function parseAuthConfig(rawRefreshToken?: string): AuthConfig | undefined {
  if (!rawRefreshToken) {
    return
  }

  try {
    const config = JSON.parse(fromBase64(rawRefreshToken))
    assert(config)
    assert(config.rt)
    return config
  } catch {
    return {
      rt: rawRefreshToken,
    }
  }
}

export class RingRestClient {
  public refreshToken
  private authConfig
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
          const timeout = setTimeout(
            () => {
              if (this._authPromise === authPromise) {
                this.clearPreviousAuth()
              }
            },
            ((expires_in || 3600) - 60) * 1000,
          )
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
  public onSession = new ReplaySubject<SessionResponse>(1)
  public readonly baseSessionMetadata

  constructor(
    private authOptions: (EmailAuth | RefreshTokenAuth) & SessionOptions,
  ) {
    this.refreshToken =
      'refreshToken' in authOptions ? authOptions.refreshToken : undefined
    this.authConfig = parseAuthConfig(this.refreshToken)
    this.hardwareIdPromise =
      this.authConfig?.hid || getHardwareId(authOptions.systemId)
    this.baseSessionMetadata = {
      api_version: apiVersion,
      device_model: authOptions.controlCenterDisplayName ?? 'ring-client-api',
    }
  }

  private getGrantData(twoFactorAuthCode?: string) {
    if (this.authConfig?.rt && !twoFactorAuthCode) {
      return {
        grant_type: 'refresh_token',
        refresh_token: this.authConfig.rt,
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
      'Refresh token is not valid.  Unable to authenticate with Ring servers.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens',
    )
  }

  async getAuth(twoFactorAuthCode?: string): Promise<AuthTokenResponse> {
    const grantData = this.getGrantData(twoFactorAuthCode)

    try {
      const hardwareId = await this.hardwareIdPromise,
        response = await requestWithRetry<AuthTokenResponse>({
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
            hardware_id: hardwareId,
            'User-Agent': 'android:com.ringapp',
          },
        }),
        oldRefreshToken = this.refreshToken

      // Store the new refresh token and auth config
      this.authConfig = {
        ...this.authConfig,
        rt: response.refresh_token,
        hid: hardwareId,
      }
      this.refreshToken = toBase64(JSON.stringify(this.authConfig))

      // Emit an event with the new token
      this.onRefreshTokenUpdated.next({
        oldRefreshToken,
        newRefreshToken: this.refreshToken,
      })

      return {
        ...response,
        // Override the refresh token in the response so that consumers of this data get the wrapped version
        refresh_token: this.refreshToken,
      }
    } catch (requestError: any) {
      if (grantData.refresh_token) {
        // failed request with refresh token
        this.refreshToken = undefined
        this.authConfig = undefined
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
        response.status === 412 || // need 2fa code
        (response.status === 400 &&
          responseError.startsWith('Verification Code')) // invalid 2fa code entered
      ) {
        this.using2fa = true

        if (response.status === 400) {
          this.promptFor2fa = 'Invalid 2fa code entered.  Please try again.'
          throw new Error(responseError)
        }

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
          'Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.',
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
          metadata: this.baseSessionMetadata,
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
        const session = await this.fetchNewSession(authToken)
        this.onSession.next(session)
        return session
      } catch (e: any) {
        const response = (e as ResponseError).response || {}

        if (response.status === 401) {
          await this.refreshAuth()
          return this.getSession()
        }

        if (response.status === 429) {
          const retryAfter = e.response.headers.get('retry-after'),
            waitSeconds = isNaN(retryAfter)
              ? 200
              : Number.parseInt(retryAfter, 10)

          logError(
            `Session response rate limited. Waiting to retry after ${waitSeconds} seconds`,
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

    this.sessionPromise
      .finally(() => {
        // Refresh the session every 12 hours
        // This is needed to keep the session alive for users outside the US, due to Data Residency laws
        // We believe Ring is clearing the session info after ~24 hours, which breaks Push Notifications
        const timeout = setTimeout(
          () => {
            this.refreshSession()
          },
          12 * 60 * 60 * 1000,
        ) // 12 hours
        this.timeouts.push(timeout)
      })
      .catch((e) => logError(e))
  }

  async request<T = void>(
    options: RequestOptions & { url: string; allowNoResponse?: boolean },
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
      const response = (e as ResponseError).response || {}

      if (response.status === 401) {
        await this.refreshAuth()
        return this.request(options)
      }

      if (response.status === 504) {
        // Gateway Timeout.  These should be recoverable, but wait a few seconds just to be on the safe side
        await delay(5000)
        return this.request(options)
      }

      if (
        response.status === 404 &&
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
            `http request failed.  ${url} returned errors: (${errorText}).  Trying again in 20 seconds`,
          )

          await delay(20000)
          return this.request(options)
        }
        logError(
          `http request failed.  ${url} returned unknown errors: (${stringify(
            errors,
          )}).`,
        )
      }

      if (response.status === 404 && url.startsWith(clientApiBaseUrl)) {
        logError('404 from endpoint ' + url)
        if (response.body?.error?.includes(hardwareId)) {
          logError(
            'Session hardware_id not found.  Creating a new session and trying again.',
          )
          if (this.sessionPromise === initialSessionPromise) {
            this.refreshSession()
          }
          return this.request(options)
        }

        throw new Error('Not found with response: ' + stringify(response.body))
      }

      if (response.status) {
        logError(
          `Request to ${url} failed with status ${
            response.status
          }. Response body: ${stringify(response.body)}`,
        )
      } else if (!options.allowNoResponse) {
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

  get _internalOnly_pushNotificationCredentials() {
    return this.authConfig?.pnc
  }

  set _internalOnly_pushNotificationCredentials(
    credentials: Credentials | undefined,
  ) {
    if (!this.refreshToken || !this.authConfig) {
      throw new Error(
        'Cannot set push notification credentials without a refresh token',
      )
    }

    const oldRefreshToken = this.refreshToken
    this.authConfig = {
      ...this.authConfig,
      pnc: credentials,
    }

    // SOMEDAY: refactor the conversion from auth config to refresh token - DRY from above
    const newRefreshToken = toBase64(JSON.stringify(this.authConfig))
    if (newRefreshToken === oldRefreshToken) {
      // No change, so we don't need to emit an updated refresh token
      return
    }

    // Save and emit the updated refresh token
    this.refreshToken = newRefreshToken
    this.onRefreshTokenUpdated.next({
      oldRefreshToken,
      newRefreshToken,
    })
  }
}
