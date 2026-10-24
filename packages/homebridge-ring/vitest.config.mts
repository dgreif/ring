import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'lib/**'],
    // Specs don't use vi.mock, so sharing module state across files is safe
    // and avoids re-importing hap-nodejs for every file
    isolate: false,
  },
})
