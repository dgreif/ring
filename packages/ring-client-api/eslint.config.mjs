import sharedConfig from 'eslint-config-shared'
import globals from 'globals'

export default [
  ...sharedConfig,
  {
    files: ['test/**/*.ts'],
    languageOptions: {
      globals: globals.jest,
    },
  },
]
