
import { _electron as electron } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, '../../saved-results'), { recursive: true })

const fake = spawn(join(root, '../../node_modules/.bin/tsx'), [join(root, 'e2e/fake-daemon.ts')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, OPENBOT_ADMIN_TOKEN: 'test-token' },
})
await new Promise((r) => setTimeout(r, 800))

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: {
    ...process.env,
    OPENBOT_DAEMON_WS: 'ws://127.0.0.1:18799/?token=test-token&scenario=browser',
    OPENBOT_ALLOW_INTEL: '1',
  },
})
const page = await app.firstWindow()
await page.waitForSelector('[data-testid="team-column"]')
const checks = {
  teamHeading: await page.getByRole('heading', { name: 'Team' }).isVisible(),
  newAgent: await page.getByTestId('new-agent').isVisible(),
  helper: await page.getByTestId('team-column').getByText('Add someone, then give them work.').isVisible(),
}
await page.getByTestId('new-agent').click()
await page.getByTestId('new-agent-name').fill('DriveAda')
await page.getByTestId('new-agent-submit').click()
await page.waitForSelector('[data-testid="composer"]')
checks.composer = await page.getByTestId('composer').isVisible()
checks.harness = await page.getByTestId('harness-switcher').isVisible()
checks.donut = await page.getByTestId('context-donut').isVisible()
checks.model = await page.getByTestId('model-picker').isVisible()
checks.spend = await page.getByTestId('spend-chip').isVisible()
checks.primary = await page.getByTestId('composer-primary').isVisible()
checks.plus = await page.getByTestId('plus-menu').isVisible()
const plusHost = page.getByTestId('right-pane-plus-only').or(page.getByTestId('right-pane'))
await plusHost.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
checks.browserEnabled = await page.getByTestId('plus-browser').isEnabled()
checks.terminalEnabled = await page.getByTestId('plus-terminal').isEnabled()
checks.filesDisabled = await page.getByTestId('plus-files').isDisabled()
await page.getByTestId('plus-browser').click()
checks.browserChrome = await page.getByTestId('browser-chrome').isVisible()
const shot = join(root, '../../saved-results/openbot-m5-real-window-2026-08-14.png')
await page.screenshot({ path: shot, fullPage: true })
const unread = await app.evaluate(() => {
  const g = globalThis
  g.unread.set({ count: 1 })
  return g.getTrayUnread()
})
checks.trayUnread = unread === true
console.log(JSON.stringify({ checks, shot }, null, 2))
await app.close()
fake.kill()
process.exit(Object.values(checks).every(Boolean) ? 0 : 1)
