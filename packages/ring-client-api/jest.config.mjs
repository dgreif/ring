import { createDefaultEsmPreset } from 'ts-jest'

export default {
  ...createDefaultEsmPreset({
    useESM: true,
    diagnostics: false,
  }),
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
