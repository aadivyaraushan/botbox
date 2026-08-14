import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(scenario = 'peer'): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:18799/?token=test-token&scenario=${scenario}`,
      OPENBOT_ALLOW_INTEL: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  return { app, page }
}

async function selectAgent(page: Page, name: string) {
  await page.getByTestId('agent-name').filter({ hasText: name }).click()
}

test.describe('OpenBot M4 peer markers', () => {
  test('Ada sent peer-message renders Messaged Bea', async () => {
    const { app, page } = await launch()
    await selectAgent(page, 'Ada')
    const marker = page.getByTestId('peer-marker')
    await expect(marker).toBeVisible()
    await expect(marker).toContainText('Messaged Bea')
    await app.close()
  })

  test('Bea received peer-message shows inbound text', async () => {
    const { app, page } = await launch()
    await selectAgent(page, 'Bea')
    const marker = page.getByTestId('peer-marker')
    await expect(marker).toBeVisible()
    await expect(marker).toContainText('Message from Ada')
    await expect(marker).toContainText('Please help')
    await app.close()
  })

  test('Bea unread while Ada selected; clears when Bea selected', async () => {
    const { app, page } = await launch()
    await selectAgent(page, 'Ada')
    await expect(page.getByTestId('peer-marker')).toContainText('Messaged Bea')

    const beaRow = page.locator('[data-testid^="team-row-"]').filter({ hasText: 'Bea' })
    await expect(beaRow.getByTestId('unread-dot')).toBeVisible()

    await selectAgent(page, 'Bea')
    await expect(page.getByTestId('peer-marker')).toContainText('Please help')
    await expect(beaRow.getByTestId('unread-dot')).toHaveCount(0)
    await app.close()
  })
})
