import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'lib/**'],
    setupFiles: ['./test/setup.ts'],
  },
})
