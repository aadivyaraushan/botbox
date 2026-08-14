import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(
  scenario: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const home = mkdtempSync(join(tmpdir(), 'openbot-gap-ui-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:18799/?token=test-token&scenario=${scenario}`,
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: home,
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  return { app, page }
}

test.describe('gap-fold-thread-ui', () => {
  test('pause-all wait modal when ask card open', async () => {
    const { app, page } = await launch('ask')
    await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
    await expect(page.getByTestId('ask-card')).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w?.webContents.send('app:menu', { action: 'pause-all' })
    })
    await expect(page.getByTestId('wait-modal')).toBeVisible()
    await expect(page.getByTestId('wait-modal')).toContainText('An agent is waiting on you')
    await page.getByTestId('wait-open').click()
    await expect(page.getByTestId('wait-modal')).toHaveCount(0)
    await app.close()
  })

  test('tool-result, Stopped., reasoning collapse', async () => {
    const { app, page } = await launch('app')
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-description').fill('Research the repo')
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name')).toBeVisible()

    await page.getByTestId('composer-input').fill('Hello')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('reasoning-row')).toBeVisible()
    await expect(page.getByTestId('tool-row')).toContainText('Bash')
    await page.getByTestId('tool-row').click()
    await expect(page.getByTestId('tool-output')).toContainText('write denied')

    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('turn-outcome')).toHaveText('Stopped.')
    await expect(page.getByTestId('reasoning-row')).toHaveAttribute('data-expanded', 'false')
    await expect(page.getByTestId('reasoning-row')).toContainText('Working.')
    await app.close()
  })

  test('error outcome shows Something went wrong', async () => {
    const { app, page } = await launch('app')
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('ErrAgent')
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name').filter({ hasText: 'ErrAgent' })).toBeVisible()
    await page.getByTestId('composer-input').fill('Boom')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('reasoning-row')).toBeVisible()
    const id =
      (await page.locator('[data-testid^="team-row-"]').filter({ hasText: 'ErrAgent' }).getAttribute('data-testid'))?.replace(
        'team-row-',
        '',
      ) ?? ''
    await page.request.get(`http://127.0.0.1:18799/debug/finish-error?agentId=${id}`)
    await expect(page.getByTestId('turn-outcome')).toContainText('Something went wrong.')
    await expect(page.getByTestId('turn-error-message')).toContainText('cli died')
    await app.close()
  })

  test('memory setup progress when hindsight not ready', async () => {
    const { app, page } = await launch('memory-setup')
    await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
    await expect(page.getByTestId('memory-setup')).toContainText('Setting up memory')
    await app.close()
  })

  test('address bar falls back to Google search URL', async () => {
    const { app, page } = await launch('browser')
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('Ada')
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name')).toBeVisible()
    await app.evaluate(async ({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      const view = menu?.items.find((i) => i.label === 'View')
      const browser = view?.submenu?.items.find((i) => i.label === 'Browser')
      browser?.click()
    })
    await expect(page.getByTestId('browser-chrome')).toBeVisible()
    await page.getByTestId('browser-url').fill('openbot docs')
    await page.getByTestId('browser-url').press('Enter')
    await expect(page.getByTestId('browser-url')).toHaveValue(/google\.com\/search\?q=/)
    await app.close()
  })
})
