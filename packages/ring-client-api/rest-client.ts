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
import type {
  Auth2faResponse,
  AuthTokenResponse,
  SessionResponse,
} from './ring-types.ts'
import { ReplaySubject } from 'rxjs'
import assert from 'assert'
import type { Credentials } from '@eneris/push-receiver/dist/types.d.js'
import { Agent } from 'undici'
import { randomBytes, createHash } from 'crypto'

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
  deviceInfoApiBaseUrl = 'https://api.ring.com/device_info/v3/',
  locationInfoApiBaseUrl = 'https://api.ring.com/location_info/v3/',
  oauthBaseUrl = 'https://oauth.ring.com',
  apiVersion = 11

function generateCodeVerifier() {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(codeVerifier: string) {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function generateState() {
  return randomBytes(16).toString('hex')
}

class SimpleCookieJar {
  private cookies = new Map<string, string>()

  extractFromResponse(response: Response) {
    const setCookies = response.headers.getSetCookie()
    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(';')
      const eqIndex = nameValue.indexOf('=')
      if (eqIndex !== -1) {
        const name = nameValue.slice(0, eqIndex).trim()
        const value = nameValue.slice(eqIndex + 1).trim()
        this.cookies.set(name, value)
      }
    }
  }

  getCookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ')
  }

  get(name: string) {
    return this.cookies.get(name)
  }
}

interface PendingPkceState {
  codeVerifier: string
  state: string
  csrfToken: string
  cookieJar: SimpleCookieJar
  redirectUri: string
}

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

export function deviceInfoApi(path: string) {
  return deviceInfoApiBaseUrl + path
}

export function locationInfoApi(path: string) {
  return locationInfoApiBaseUrl + path
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
  private authOptions

  constructor(authOptions: (EmailAuth | RefreshTokenAuth) & SessionOptions) {
    this.authOptions = authOptions
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

  private pendingPkceState?: PendingPkceState

  private extractCsrfToken(html: string, cookieJar: SimpleCookieJar): string {
    // Try cookie-based CSRF token — check various common names
    for (const name of [
      'csrf-token',
      'csrfToken',
      'csrf_token',
      '_csrf',
      'XSRF-TOKEN',
    ]) {
      const cookieCsrf = cookieJar.get(name)
      if (cookieCsrf) return cookieCsrf
    }

    // Try __NEXT_DATA__ JSON blob (Next.js page) — search deeply for csrf token
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
    )
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1])
        const csrfToken = this.findCsrfInObject(nextData)
        if (csrfToken) return csrfToken
      } catch {
        // fall through
      }
    }

    // Try hidden input field (various name patterns)
    const inputMatch =
      html.match(/name="csrf-token"[^>]*value="([^"]+)"/) ||
      html.match(/value="([^"]+)"[^>]*name="csrf-token"/) ||
      html.match(/name="csrfToken"[^>]*value="([^"]+)"/) ||
      html.match(/value="([^"]+)"[^>]*name="csrfToken"/) ||
      html.match(/name="_csrf"[^>]*value="([^"]+)"/) ||
      html.match(/value="([^"]+)"[^>]*name="_csrf"/)
    if (inputMatch) return inputMatch[1]

    // Try meta tag
    const metaMatch =
      html.match(
        /meta[^>]*name="csrf-token"[^>]*content="([^"]+)"/,
      ) || html.match(/meta[^>]*name="csrfToken"[^>]*content="([^"]+)"/)
    if (metaMatch) return metaMatch[1]

    // Try any JavaScript variable assignment that looks like a CSRF token
    const jsMatch = html.match(
      /["']csrf[-_]?[Tt]oken["']\s*[=:]\s*["']([^"']+)["']/,
    )
    if (jsMatch) return jsMatch[1]

    logDebug(
      'CSRF extraction failed. Cookies: ' + cookieJar.getCookieHeader(),
    )
    logDebug(
      'HTML preview (first 2000 chars): ' + html.substring(0, 2000),
    )

    throw new Error('Unable to extract CSRF token from Ring OAuth page')
  }

  private findCsrfInObject(obj: any, depth = 0): string | undefined {
    if (!obj || typeof obj !== 'object' || depth > 5) return undefined
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase()
      if (
        (lowerKey === 'csrftoken' || lowerKey === 'csrf' ||
          lowerKey === 'csrf-token' || lowerKey === 'csrf_token') &&
        typeof obj[key] === 'string'
      ) {
        return obj[key]
      }
      const found = this.findCsrfInObject(obj[key], depth + 1)
      if (found) return found
    }
    return undefined
  }

  private async initiatePkceFlow(): Promise<void> {
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)
    const state = generateState()
    const hardwareId = await this.hardwareIdPromise
    const redirectUri = 'https://ring.com/signin/callback'
    const cookieJar = new SimpleCookieJar()

    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      client_id: 'ring_official_android',
      response_type: 'code',
      prompt: 'login',
      state,
      scope: 'client',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      device_model: 'ring-client-api',
      app_version: '3.102.0',
      dark_mode: 'false',
      device_brand: 'nodejs',
      device_os_version: process.version,
      app_brand: 'ring',
      hardware_id: hardwareId,
    })

    // Initiate the OAuth flow — follow redirects manually to collect cookies
    let currentUrl = `${oauthBaseUrl}/oauth/v2/authorize?${params}`
    let html = ''

    // Follow up to 5 redirects to reach the signin page
    for (let i = 0; i < 5; i++) {
      const options = {
        method: 'GET',
        redirect: 'manual' as const,
        headers: {
          'User-Agent': 'android:com.ringapp',
          Cookie: cookieJar.getCookieHeader(),
        },
        dispatcher: fetchAgent,
      }
      const response = await fetch(currentUrl, options)
      cookieJar.extractFromResponse(response)

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) break
        currentUrl = location.startsWith('/')
          ? `${oauthBaseUrl}${location}`
          : location
        continue
      }

      html = await response.text()
      break
    }

    logDebug(`Cookies after initiatePkceFlow: ${cookieJar.getCookieHeader()}`)
    const csrfToken = this.extractCsrfToken(html, cookieJar)
    logDebug(`Extracted CSRF token: ${csrfToken.substring(0, 20)}...`)

    this.pendingPkceState = {
      codeVerifier,
      state,
      csrfToken,
      cookieJar,
      redirectUri,
    }
  }

  private async submitCredentials(): Promise<void> {
    const { authOptions } = this
    if (!('email' in authOptions) || !this.pendingPkceState) {
      throw new Error('No pending PKCE flow or email credentials')
    }

    const { csrfToken, cookieJar } = this.pendingPkceState

    const body = new URLSearchParams({
      username: authOptions.email,
      password: authOptions.password,
      'csrf-token': csrfToken,
    })

    const signinPostOptions = {
      method: 'POST',
      redirect: 'manual' as const,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'android:com.ringapp',
        Cookie: cookieJar.getCookieHeader(),
      },
      body: body.toString(),
      dispatcher: fetchAgent,
    }
    const response = await fetch(
      `${oauthBaseUrl}/oauth/v2/signin`,
      signinPostOptions,
    )

    cookieJar.extractFromResponse(response)
    logDebug(`Cookies after submitCredentials: ${cookieJar.getCookieHeader()}`)
    logDebug(`submitCredentials response status: ${response.status}`)

    if (response.status === 412) {
      // 2FA required
      const responseData = (await response.json()) as Auth2faResponse
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
        'Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.',
      )
    }

    if (!response.ok && response.status !== 302) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(
        `Sign-in failed with status ${response.status}: ${errorBody}`,
      )
    }
  }

  private async verify2fa(code: string): Promise<void> {
    if (!this.pendingPkceState) {
      throw new Error('No pending PKCE flow state for 2FA verification')
    }

    const { csrfToken, cookieJar } = this.pendingPkceState

    const body = new URLSearchParams({
      '2fa_code': code,
      'csrf-token': csrfToken,
      remember_me: 'false',
    })

    logDebug(`2FA verify request cookies: ${cookieJar.getCookieHeader()}`)

    const verifyOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'android:com.ringapp',
        Cookie: cookieJar.getCookieHeader(),
      },
      body: body.toString(),
      dispatcher: fetchAgent,
    }
    const response = await fetch(
      `${oauthBaseUrl}/oauth/v2/2fa/verify`,
      verifyOptions,
    )

    cookieJar.extractFromResponse(response)

    logDebug(`2FA verify response status: ${response.status}`)
    logDebug(`2FA verify response cookies: ${cookieJar.getCookieHeader()}`)

    if (response.status === 400 || response.status === 401) {
      const responseBody = await response.text().catch(() => '')
      logDebug(`2FA verify error body: ${responseBody}`)
      this.promptFor2fa = 'Invalid 2fa code entered.  Please try again.'
      throw new Error('Verification Code is invalid or expired')
    }

    if (response.status !== 200 && response.status !== 201) {
      const responseBody = await response.text().catch(() => '')
      logDebug(`2FA verify unexpected response: ${responseBody}`)
      throw new Error(`2FA verification failed with status ${response.status}`)
    }

    // Read the response body to get redirect_url
    const verifyBody = await response.json().catch(() => ({})) as any
    logDebug(`2FA verification successful: ${JSON.stringify(verifyBody)}`)
    logDebug(`All cookies after 2FA: ${cookieJar.getCookieHeader()}`)
  }

  private async getAuthorizationCode(): Promise<string> {
    if (!this.pendingPkceState) {
      throw new Error('No pending PKCE flow state')
    }

    const { state, cookieJar } = this.pendingPkceState

    logDebug(
      `Authorize code request cookies: ${cookieJar.getCookieHeader()}`,
    )

    // After 2FA, the server remembers the original authorize params from the session.
    // We just need to revisit /oauth/v2/authorize with the session cookies.
    let authorizeUrl = `${oauthBaseUrl}/oauth/v2/authorize`

    // Follow redirects manually to find the one with the authorization code
    for (let i = 0; i < 5; i++) {
      const reqOptions = {
        method: 'GET',
        redirect: 'manual' as const,
        headers: {
          'User-Agent': 'android:com.ringapp',
          Cookie: cookieJar.getCookieHeader(),
        },
        dispatcher: fetchAgent,
      }
      logDebug(`Authorize request ${i}: ${authorizeUrl}`)
      const response = await fetch(authorizeUrl, reqOptions)
      cookieJar.extractFromResponse(response)

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        logDebug(`Authorize redirect ${i}: ${location}`)

        if (!location) {
          throw new Error('No location header in authorize redirect')
        }

        const redirectUrl = new URL(location, oauthBaseUrl)
        const code = redirectUrl.searchParams.get('code')
        const returnedState = redirectUrl.searchParams.get('state')

        if (code) {
          if (returnedState !== state) {
            throw new Error('State mismatch in OAuth response')
          }
          return code
        }

        // No code yet — follow this redirect
        authorizeUrl = location.startsWith('/')
          ? `${oauthBaseUrl}${location}`
          : location
        continue
      }

      // Not a redirect — log details for debugging
      const body = await response.text().catch(() => '')
      logDebug(
        `Authorize non-redirect response (${response.status}): ${body.substring(0, 1000)}`,
      )
      throw new Error(
        `Expected redirect from authorize but got ${response.status}`,
      )
    }

    throw new Error(
      'Failed to get authorization code after following redirects',
    )
  }

  private async exchangeCodeForTokens(
    code: string,
  ): Promise<AuthTokenResponse> {
    if (!this.pendingPkceState) {
      throw new Error('No pending PKCE flow state')
    }

    const { codeVerifier, redirectUri } = this.pendingPkceState
    const hardwareId = await this.hardwareIdPromise

    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: 'ring_official_android',
    })

    const tokenOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'android:com.ringapp',
        hardware_id: hardwareId,
      },
      body: body.toString(),
      dispatcher: fetchAgent,
    }
    const response = await fetch(`${oauthBaseUrl}/oauth/token`, tokenOptions)

    if (!response.ok) {
      const error = await responseToError(response)
      throw error
    }

    const tokenResponse = (await response.json()) as AuthTokenResponse

    // Clean up PKCE state
    this.pendingPkceState = undefined

    return tokenResponse
  }

  private async refreshWithToken(): Promise<AuthTokenResponse> {
    const hardwareId = await this.hardwareIdPromise

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.authConfig!.rt,
      client_id: 'ring_official_android',
      scope: 'client',
    })

    const response = await requestWithRetry<AuthTokenResponse>({
      url: `${oauthBaseUrl}/oauth/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'android:com.ringapp',
        hardware_id: hardwareId,
      },
      body: body.toString(),
    })

    return response
  }

  private async authenticateWithPkce(
    twoFactorAuthCode?: string,
  ): Promise<AuthTokenResponse> {
    // Track whether we've passed the 2FA stage so we can distinguish
    // "need 2FA code" errors from post-2FA errors
    let past2fa = false

    try {
      if (twoFactorAuthCode && this.pendingPkceState) {
        // We have a 2FA code and an existing PKCE session — verify and continue
        await this.verify2fa(twoFactorAuthCode)
        past2fa = true
      } else {
        // Start fresh PKCE flow
        await this.initiatePkceFlow()
        await this.submitCredentials()
        // If we reach here without throwing, no 2FA was needed
        past2fa = true
      }

      // Get the authorization code via redirect
      logDebug('Getting authorization code...')
      const code = await this.getAuthorizationCode()
      logDebug(`Got authorization code: ${code.substring(0, 10)}...`)

      // Exchange code for tokens
      logDebug('Exchanging code for tokens...')
      return await this.exchangeCodeForTokens(code)
    } catch (error: any) {
      // Re-throw 2FA prompt errors as-is (only when we haven't passed 2FA yet)
      if (this.using2fa && this.promptFor2fa && !past2fa) {
        throw error
      }

      const authTypeMessage =
          'refreshToken' in this.authOptions
            ? 'refresh token is'
            : 'email and password are',
        errorMessage =
          `Failed to fetch oauth token from Ring. Verify that your ${authTypeMessage} correct.` +
          (error.message ? ` (error: ${error.message})` : '')
      logError(error)
      logError(errorMessage)
      throw new Error(errorMessage)
    }
  }

  private async updateTokens(response: AuthTokenResponse) {
    const oldRefreshToken = this.refreshToken
    const hardwareId = await this.hardwareIdPromise

    this.authConfig = {
      ...this.authConfig,
      rt: response.refresh_token,
      hid: hardwareId,
    }
    this.refreshToken = toBase64(JSON.stringify(this.authConfig))

    this.onRefreshTokenUpdated.next({
      oldRefreshToken,
      newRefreshToken: this.refreshToken,
    })

    return {
      ...response,
      refresh_token: this.refreshToken,
    }
  }

  async getAuth(twoFactorAuthCode?: string): Promise<AuthTokenResponse> {
    // If we have a refresh token and no 2FA code, use refresh flow
    if (this.authConfig?.rt && !twoFactorAuthCode) {
      try {
        const response = await this.refreshWithToken()
        return this.updateTokens(response)
      } catch (e) {
        // Refresh token failed — clear it and try email/password if available
        this.refreshToken = undefined
        this.authConfig = undefined
        logError(e)
        return this.getAuth()
      }
    }

    // Email/password auth via PKCE
    const { authOptions } = this
    if ('email' in authOptions) {
      const response = await this.authenticateWithPkce(twoFactorAuthCode)
      return this.updateTokens(response)
    }

    throw new Error(
      'Refresh token is not valid.  Unable to authenticate with Ring servers.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens',
    )
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
