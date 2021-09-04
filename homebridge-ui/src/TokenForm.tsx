import { useEffect, useState } from 'react'
import '@homebridge/plugin-ui-utils/dist/ui.interface'

const { homebridge } = window

export default function TokenForm({
  onRefreshToken,
}: {
  onRefreshToken(token: string): any
}) {
  const [loading, setLoading] = useState(false),
    [loginInfo, setLoginInfo] = useState<
      { email: string; password: string; codePrompt: string } | undefined
    >()

  useEffect(() => {
    if (loading) {
      homebridge.showSpinner()
    } else {
      homebridge.hideSpinner()
    }
  }, [loading])

  useEffect(() => {
    if (loginInfo) {
      const form = homebridge.createForm(
        {
          schema: {
            type: 'object',
            properties: {
              code: {
                title: 'Code',
                type: 'string',
                required: true,
                description: loginInfo.codePrompt,
              },
            },
          },
        },
        {},
        'Link Account',
        'Change Email'
      )

      form.onSubmit(async ({ code }) => {
        setLoading(true)

        try {
          const { refreshToken } = await homebridge.request('/token', {
            email: loginInfo.email,
            password: loginInfo.password,
            code,
          })

          onRefreshToken(refreshToken)
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(e)
          homebridge.toast.error(e.message, 'Failed to Link Account')
        } finally {
          setLoading(false)
        }
      })

      form.onCancel(() => setLoginInfo(undefined))
    } else {
      const form = homebridge.createForm(
        {
          schema: {
            type: 'object',
            properties: {
              email: {
                title: 'Email',
                type: 'string',
                'x-schema-form': {
                  type: 'email',
                },
                required: true,
              },
              password: {
                title: 'Password',
                type: 'string',
                'x-schema-form': {
                  type: 'password',
                },
                required: true,
              },
            },
          },
        },
        {},
        'Log In'
      )

      form.onSubmit(async ({ email, password }) => {
        setLoading(true)
        await new Promise((r) => setTimeout(r, 1000))

        try {
          const response = (await homebridge.request('/send-code', {
            email,
            password,
          })) as { codePrompt: string } | { refreshToken: string }

          if ('refreshToken' in response) {
            // didn't need 2fa, return token without asking for code
            onRefreshToken(response.refreshToken)
          } else {
            setLoginInfo({
              email,
              password,
              codePrompt: response.codePrompt,
            })
          }
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error(e)
          homebridge.toast.error(e.message, 'Ring Login Failed')
        } finally {
          setLoading(false)
        }
      })
    }
  }, [onRefreshToken, loginInfo])

  return <h4 className="text-center primary-text mb-3">Link Ring Account</h4>
}
