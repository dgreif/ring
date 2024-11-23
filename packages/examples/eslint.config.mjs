import sharedConfig from 'eslint-config-shared'

export default [
  ...sharedConfig,
  {
    rules: {
      'no-console': 'off',
    },
  },
]
