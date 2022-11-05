/* eslint-disable no-console */
import {
  HomebridgePluginUiServer,
  RequestError,
} from '@homebridge/plugin-ui-utils'

import { RingRestClient } from '../../api/rest-client'

interface LoginRequest {
  email: string
  password: string
}

interface TokenRequest {
  email: string
  password: string
  code: string
}

class PluginUiServer extends HomebridgePluginUiServer {
  restClient?: RingRestClient

  constructor() {
    super()

    this.onRequest('/send-code', this.generateCode)
    this.onRequest('/token', this.generateToken)

    this.ready()
  }

  generateCode = async ({ email, password }: LoginRequest) => {
    console.log(`Logging in with email '${email}'`)
    this.restClient = new RingRestClient({ email, password })

    try {
      const { refresh_token } = await this.restClient.getCurrentAuth()

      // If we get here, 2fa was not required.  I'm not sure this is possible anymore, but it's here just in case
      return { refreshToken: refresh_token }
    } catch (e: any) {
      if (this.restClient.promptFor2fa) {
        console.log(this.restClient.promptFor2fa)
        return { codePrompt: this.restClient.promptFor2fa }
      }

      console.error(e)
      throw new RequestError(e.message, e)
    }
  }

  generateToken = async ({ email, password, code }: TokenRequest) => {
    // use the existing restClient to avoid sending a token again
    this.restClient = this.restClient || new RingRestClient({ email, password })
    console.log(`Getting token for ${email} with code ${code}`)

    try {
      const authResponse = await this.restClient.getAuth(code)

      return { refreshToken: authResponse.refresh_token }
    } catch (e: any) {
      console.error('Incorrect 2fa Code')
      throw new RequestError('Please check the code and try again', e)
    }
  }
}

function startPluginUiServer() {
  return new PluginUiServer()
}

startPluginUiServer()
