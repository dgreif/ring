import { createHash, randomBytes } from 'crypto'
import { fetch as undiciFetch } from 'undici'
import { logDebug } from './util.ts'
import type { AuthTokenResponse } from './ring-types.ts'

const oauthBaseUrl = 'https://oauth.ring.com',
  redirectUri = 'https://ring.com/signin/callback',
  clientId = 'ring_official_android',
  userAgent = 'android:com.ringapp',
  maxRedirects = 5,
  requestTimeout = 20000

/**
 * Error with the same `response` shape as the errors thrown by `requestWithRetry`, so that
 * `RingRestClient.getAuth` can handle failures from either sign-in path the same way.
 */
export class OAuthWebLoginError extends Error {
  response: { status: number; body: any; headers?: Headers }

  constructor(
    message: string,
    response: { status: number; body: any; headers?: Headers },
  ) {
    super(message)
    this.name = 'OAuthWebLoginError'
    this.response = response
  }
}

interface WebResponse {
  status: number
  location: string | null
  text: string
  body: any
  headers: Headers
}

/**
 * The sign-in page carries its CSRF token in the JSON of `<script id="oauth-args">`,
 * e.g. `{"csrf-token":"..."}`
 */
export function findCsrfToken(html: string) {
  const match = html.match(/["']csrf[-_]?token["']\s*[:=]\s*["']([^"']+)["']/i)
  return match?.[1]
}

function isRedirect(response: WebResponse) {
  return (
    response.status >= 300 &&
    response.status < 400 &&
    Boolean(response.location)
  )
}

/**
 * Signs in to Ring with the OAuth 2.0 authorization code flow with PKCE, the same web flow
 * the Ring app uses:
 *
 * 1. `GET /oauth/v2/authorize` (PKCE challenge) redirects to the sign-in page, which holds a CSRF token
 * 2. `POST /oauth/v2/signin` with the email and password
 * 3. `POST /oauth/v2/2fa/verify` with the 2fa code, if the account requires one
 * 4. `GET /oauth/v2/authorize` redirects to the callback with an authorization `code`
 * 5. `POST /oauth/token` exchanges the code (and PKCE verifier) for tokens
 *
 * Ring rejects the legacy `grant_type=password` request on `/oauth/token` with
 * `406 Not Acceptable`. Refreshing a token is unchanged and still uses `/oauth/token`.
 *
 * One instance is one sign-in attempt, and must be kept between the password step and the
 * 2fa step: the web session lives in its cookies.
 */
export class OAuthWebLogin {
  private readonly cookies = new Map<string, string>()
  private readonly codeVerifier = randomBytes(32).toString('base64url')
  private readonly state = randomBytes(16).toString('hex')
  private csrfToken?: string
  private readonly hardwareId
  private readonly deviceModel

  constructor(hardwareId: string, deviceModel = 'ring-client-api') {
    this.hardwareId = hardwareId
    this.deviceModel = deviceModel
  }

  /**
   * Opens the sign-in page and submits the email and password.
   * Throws an error with `response.status` 412 and the 2fa details (`tsv_state`, `phone`)
   * when the account requires a 2fa code, which is then passed to `verify2fa`.
   */
  async signIn(email: string, password: string) {
    await this.openSignInPage()

    const response = await this.request('/oauth/v2/signin', {
        method: 'POST',
        form: { username: email, password, 'csrf-token': this.csrfToken! },
      }),
      body =
        typeof response.body === 'object' && response.body !== null
          ? response.body
          : {}

    if (
      response.status === 412 ||
      'tsv_state' in body ||
      'next_time_in_secs' in body ||
      response.location?.includes('/2fa')
    ) {
      throw new OAuthWebLoginError('2fa code required', {
        status: 412,
        body,
        headers: response.headers,
      })
    }

    this.assertOk(response)
  }

  /**
   * Submits the 2fa code for a sign-in that is waiting for one. An invalid or expired code
   * throws an error with `response.status` 400, like the legacy flow, and another code can
   * then be tried on this instance.
   */
  async verify2fa(code: string) {
    const response = await this.request('/oauth/v2/2fa/verify', {
      method: 'POST',
      form: {
        '2fa_code': code,
        'csrf-token': this.csrfToken!,
        remember_me: 'false',
      },
    })

    if (response.status === 400 || response.status === 401) {
      throw new OAuthWebLoginError('Verification Code is invalid or expired', {
        status: 400,
        body: { error: 'Verification Code is invalid or expired' },
        headers: response.headers,
      })
    }

    this.assertOk(response)
  }

  /**
   * Follows the authorize redirect to get the authorization code, and exchanges it for tokens.
   */
  async getToken(): Promise<AuthTokenResponse> {
    const code = await this.getAuthorizationCode(),
      response = await this.request('/oauth/token', {
        method: 'POST',
        form: {
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          code_verifier: this.codeVerifier,
          redirect_uri: redirectUri,
        },
        headers: { Accept: 'application/json', hardware_id: this.hardwareId },
        sendCookies: false,
      })

    this.assertOk(response)

    if (!response.body?.access_token || !response.body?.refresh_token) {
      throw new OAuthWebLoginError('Ring did not return a token', response)
    }

    return response.body
  }

  private async openSignInPage() {
    const codeChallenge = createHash('sha256')
        .update(this.codeVerifier)
        .digest('base64url'),
      params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'client',
        redirect_uri: redirectUri,
        state: this.state,
        prompt: 'login',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        hardware_id: this.hardwareId,
        app_brand: 'ring',
        device_model: this.deviceModel,
      })

    let response = await this.request(`/oauth/v2/authorize?${params}`)
    for (let i = 0; i < maxRedirects && isRedirect(response); i++) {
      response = await this.request(response.location!)
    }

    this.assertOk(response)

    this.csrfToken =
      this.cookies.get('csrf-token') ?? findCsrfToken(response.text)
    if (!this.csrfToken) {
      throw new OAuthWebLoginError(
        'Unable to find the CSRF token on the Ring sign-in page',
        response,
      )
    }
  }

  private async getAuthorizationCode() {
    let url = '/oauth/v2/authorize'

    for (let i = 0; i < maxRedirects; i++) {
      const response = await this.request(url)
      if (!isRedirect(response)) {
        this.assertOk(response)
        throw new OAuthWebLoginError(
          'Ring did not redirect with an authorization code',
          response,
        )
      }

      const location = new URL(response.location!, oauthBaseUrl),
        code = location.searchParams.get('code')
      if (code) {
        if (location.searchParams.get('state') !== this.state) {
          throw new OAuthWebLoginError(
            'Ring returned an authorization code for a different sign-in (state mismatch)',
            response,
          )
        }
        return code
      }
      url = location.toString()
    }

    throw new OAuthWebLoginError(
      'Too many redirects while waiting for an authorization code',
      { status: 0, body: null },
    )
  }

  private assertOk(response: WebResponse) {
    if (response.status >= 400) {
      throw new OAuthWebLoginError(
        `Ring sign-in request failed with status ${response.status}`,
        response,
      )
    }
  }

  private async request(
    pathOrUrl: string,
    {
      method = 'GET',
      form,
      headers = {},
      sendCookies = true,
    }: {
      method?: 'GET' | 'POST'
      form?: Record<string, string>
      headers?: Record<string, string>
      sendCookies?: boolean
    } = {},
  ): Promise<WebResponse> {
    const url = new URL(pathOrUrl, oauthBaseUrl),
      requestHeaders: Record<string, string> = {
        'User-Agent': userAgent,
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...headers,
      }

    // The web session lives in cookies, which only go back to Ring's sign-in pages
    if (sendCookies && url.origin === oauthBaseUrl && this.cookies.size) {
      requestHeaders.Cookie = [...this.cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
    }

    if (form) {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
    }

    const response = await undiciFetch(url, {
        method,
        headers: requestHeaders,
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(requestTimeout),
      }),
      text = await response.text()

    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';'),
        separator = pair.indexOf('=')
      if (separator <= 0) {
        continue
      }

      const name = pair.slice(0, separator).trim(),
        value = pair.slice(separator + 1).trim()
      if (!value || /max-age=0/i.test(cookie)) {
        this.cookies.delete(name)
      } else {
        this.cookies.set(name, value)
      }
    }

    let body: any = text
    try {
      body = JSON.parse(text)
    } catch {
      // not json, keep the text
    }

    logDebug(`Ring sign-in: ${method} ${url.pathname} ${response.status}`)

    return {
      status: response.status,
      location: response.headers.get('location'),
      text,
      body,
      headers: response.headers as unknown as Headers,
    }
  }
}
