import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/main/arch.test.ts', 'src/main/tray-notify.test.ts'],
    environment: 'node',
  },
})
