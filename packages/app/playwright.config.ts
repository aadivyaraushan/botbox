import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [
    {
      name: 'ci',
      testIgnore: ['**/login-ax.spec.ts'],
    },
    {
      name: 'local-ax',
      testMatch: ['**/login-ax.spec.ts'],
    },
  ],
  webServer: {
    command: '../../node_modules/.bin/tsx e2e/fake-daemon.ts',
    url: 'http://127.0.0.1:18799/health',
    reuseExistingServer: !process.env.CI,
    cwd: root,
    env: {
      ...process.env,
      OPENBOT_ADMIN_TOKEN: 'test-token',
    },
  },
})
