import { createDefaultEsmPreset } from 'ts-jest'

export default {
  ...createDefaultEsmPreset({
    useESM: true,
  }),
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
