import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const openbotHome = mkdtempSync(join(tmpdir(), 'openbot-m6-'))

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: 'ws://127.0.0.1:18799/?token=test-token&scenario=files',
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: openbotHome,
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  return { app, page }
}

async function createAda(page: Page) {
  await page.getByTestId('new-agent').click()
  await page.getByTestId('new-agent-name').fill('Ada')
  await page.getByTestId('new-agent-submit').click()
  await expect(page.getByTestId('agent-name')).toBeVisible()
}

test.describe('OpenBot M6 files tabs', () => {
  test('right-pane Files list, preview, Cmd+P, plus menu', async () => {
    const { app, page } = await launch()
    await createAda(page)

    await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
    await expect(page.getByTestId('plus-files')).toBeEnabled()
    await page.getByTestId('plus-files').click()

    await expect(page.getByTestId('right-pane')).toBeVisible()
    await expect(page.getByTestId('files-pane')).toBeVisible()
    await expect(page.getByTestId('file-row-role.md')).toBeVisible()
    await expect(page.getByTestId('file-row-MEMORY.md')).toBeVisible()
    await expect(page.getByTestId('file-row-browser-profile')).toHaveCount(0)
    await expect(page.locator('[data-testid*="browser-profile"]')).toHaveCount(0)

    await page.getByTestId('file-row-MEMORY.md').click()
    await expect(page.getByTestId('files-preview')).toBeVisible()
    await expect(page.getByTestId('files-preview')).toHaveText('hello')
    await expect(page.getByTestId('files-save')).toHaveCount(0)

    await page.keyboard.press('Meta+p')
    await expect(page.getByTestId('files-search')).toBeFocused()

    await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
    await page.getByTestId('plus-files').click()
    await expect(page.getByTestId('tab-files')).toHaveCount(2)

    await app.close()
  })
})
