import { describe, expect, it } from 'vitest'
import { findCsrfToken } from '../oauth-web-login.ts'

describe('findCsrfToken', () => {
  it('should read the csrf token from the oauth-args script', () => {
    expect(
      findCsrfToken(
        '<script id="oauth-args" type="application/json">{"app-args":{"app-brand":"ring"},"csrf-token":"abc/123+def==","empty-cookies":true}</script>',
      ),
    ).toEqual('abc/123+def==')
  })

  it('should return undefined when the page has no csrf token', () => {
    expect(findCsrfToken('<html></html>')).toBeUndefined()
  })
})
