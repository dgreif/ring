import ReactDOM from 'react-dom'
import CustomConfigUi from './CustomConfigUi'
import '@homebridge/plugin-ui-utils/dist/ui.interface'

window.homebridge.addEventListener('ready', () => {
  ReactDOM.render(<CustomConfigUi />, document.getElementById('root'))
})
