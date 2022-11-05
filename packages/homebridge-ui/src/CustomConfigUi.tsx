import { useEffect, useState } from 'react'
import '@homebridge/plugin-ui-utils/dist/ui.interface'
import TokenForm from './TokenForm'
const { homebridge } = window

function getConfigs() {
  return homebridge.getPluginConfig()
}

export default function CustomConfigUi() {
  const [showTokenForm, setShowTokenForm] = useState(false)

  useEffect(() => {
    if (showTokenForm) {
      homebridge.hideSchemaForm()
    } else {
      homebridge.showSchemaForm()
    }
  }, [showTokenForm])

  useEffect(() => {
    getConfigs()
      .then((configs) => {
        const needToken = !configs[0]?.refreshToken
        setShowTokenForm(needToken)
      })
      // eslint-disable-next-line no-console
      .catch((e) => console.error(e))
  }, [])

  async function onRefreshToken(refreshToken: string) {
    const [config, ...otherConfigs] = await getConfigs()
    await homebridge.updatePluginConfig([
      { ...config, refreshToken },
      ...otherConfigs,
    ])
    homebridge.toast.success('Refresh Token Updated', 'Ring Login Successful')
    setShowTokenForm(false)
  }

  return showTokenForm ? (
    <TokenForm onRefreshToken={onRefreshToken}></TokenForm>
  ) : (
    <button
      className="btn btn-link m-0 p-0"
      onClick={() => setShowTokenForm(true)}
    >
      <i className="fa fa-redo mr-2"></i>
      Generate New Refresh Token
    </button>
  )
}
