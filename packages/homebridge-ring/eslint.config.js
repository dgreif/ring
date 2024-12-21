import sharedConfig from 'eslint-config-shared'
import globals from 'globals'

export default [
  ...sharedConfig,
  {
    files: ['homebridge-ui/**/*.ts'],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      'no-use-before-define': 'off',
    },
  },
]
