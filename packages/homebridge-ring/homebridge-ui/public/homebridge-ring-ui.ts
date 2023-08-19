const { homebridge } = window
const newTokenButton = document.getElementById('ring-new-token')
const linkAccountHeader = document.getElementById('ring-link-account-header')

if (!newTokenButton) {
  homebridge.toast.error('no ring-new-token element found!')
  throw new Error('no ring-new-token element found!')
}

if (!linkAccountHeader) {
  homebridge.toast.error('no ring-link-account-header element found!')
  throw new Error('no ring-link-account-header element found!')
}

newTokenButton.addEventListener('click', () => {
  showLoginForm()
})

/**
 * Render the correct form, based on whether we have an existing refresh token
 */
async function renderForm() {
  const [config] = await homebridge.getPluginConfig()
  const needToken = !config?.refreshToken

  homebridge.hideSpinner()

  if (needToken) {
    showLoginForm()
  } else {
    showStandardForm()
  }
}
renderForm()

async function setRefreshToken(refreshToken: string) {
  const [config, ...otherConfigs] = await homebridge.getPluginConfig()
  await homebridge.updatePluginConfig([
    { ...config, refreshToken },
    ...otherConfigs,
  ])
  homebridge.toast.success('Refresh Token Updated', 'Ring Login Successful')
  showStandardForm()
}

function showStandardForm() {
  newTokenButton?.style.setProperty('display', 'block')
  linkAccountHeader?.style.setProperty('display', 'none')
  homebridge.showSchemaForm()
}

function showLoginForm() {
  // Hide the standard form
  newTokenButton?.style.setProperty('display', 'none')
  linkAccountHeader?.style.setProperty('display', 'block')
  homebridge.hideSchemaForm()

  // Create a new login form
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
    homebridge.showSpinner()

    try {
      const response = (await homebridge.request('/send-code', {
        email,
        password,
      })) as { codePrompt: string } | { refreshToken: string }

      if ('refreshToken' in response) {
        // didn't need 2fa, return token without asking for code
        setRefreshToken(response.refreshToken)
      } else {
        // Need a token, so show the token form
        showTokenForm({
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
      homebridge.hideSpinner()
    }
  })
}

function showTokenForm(loginInfo: {
  email: string
  password: string
  codePrompt: string
}) {
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
    homebridge.showSpinner()

    try {
      const { refreshToken } = await homebridge.request('/token', {
        email: loginInfo.email,
        password: loginInfo.password,
        code,
      })

      setRefreshToken(refreshToken)
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e)
      homebridge.toast.error(e.message, 'Failed to Link Account')
    } finally {
      homebridge.hideSpinner()
    }
  })

  form.onCancel(() => showLoginForm())
}
