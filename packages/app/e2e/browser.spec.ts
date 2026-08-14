import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { waitForAgentName } from './helpers'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const openbotHome = mkdtempSync(join(tmpdir(), 'openbot-m5-'))

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: 'ws://127.0.0.1:18799/?token=test-token&scenario=browser',
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: openbotHome,
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  return { app, page }
}

async function clickMenu(app: ElectronApplication, path: string[]) {
  await app.evaluate(async ({ Menu }, labels) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('no application menu')
    let current: Electron.Menu | undefined = menu
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i]!
      const items: Electron.MenuItem[] = current?.items ?? []
      const item = items.find((it: Electron.MenuItem) => it.label === label)
      if (!item) throw new Error(`menu item not found: ${labels.slice(0, i + 1).join(' > ')}`)
      if (i === labels.length - 1) {
        item.click()
        return
      }
      current = item.submenu ?? undefined
      if (!current) throw new Error(`no submenu for ${label}`)
    }
  }, path)
}

async function createAda(page: Page) {
  await page.getByTestId('new-agent').click()
  await page.getByTestId('new-agent-name').fill('Ada')
  await page.getByTestId('new-agent-submit').click()
  await waitForAgentName(page, 'Ada')
}

test.describe('OpenBot M5 browser + terminal', () => {
  test('View→Browser, plus menu, tabs, driving, terminal shortcut', async () => {
    const { app, page } = await launch()
    await createAda(page)

    await clickMenu(app, ['View', 'Browser'])
    await expect(page.getByTestId('browser-chrome')).toBeVisible()
    await expect(page.getByTestId('browser-url')).toBeVisible()

    await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
    await expect(page.getByTestId('plus-terminal')).toBeEnabled()
    await expect(page.getByTestId('plus-browser')).toBeEnabled()
    await expect(page.getByTestId('plus-files')).toBeEnabled()
    await page.getByTestId('plus-browser').click()
    await expect(page.getByTestId('tab-browser')).toHaveCount(2)

    // needs-site path
    const id =
      (await page.locator('[data-testid^="team-row-"]').first().getAttribute('data-testid'))?.replace(
        'team-row-',
        '',
      ) ?? ''
    const needs = await page.request.get(`http://127.0.0.1:18799/debug/needs-site?agentId=${id}&host=example.com`)
    expect((await needs.json()).ok).toBeTruthy()
    await expect(page.getByTestId('banner-needs-site')).toBeVisible()
    await page.getByTestId('allow-site').click()
    await expect(page.getByTestId('banner-needs-site')).toHaveCount(0)

    // Submit URL bar (form navigate) — must not only assert the fill value
    await page.getByTestId('browser-url').fill('https://example.com/')
    await page.getByTestId('browser-url').press('Enter')
    await expect(page.getByTestId('browser-url')).toHaveValue(/example\.com/, { timeout: 15_000 })

    // Take control / Return control (pane only)
    await page.getByTestId('take-control').click()
    await expect(page.getByTestId('youre-driving')).toBeVisible()
    await page.getByTestId('return-control').click()
    await expect(page.getByTestId('youre-driving')).toHaveCount(0)

    // browser.exec with no tab forces visible tab — close all first; no silent menu fallback
    const closes = page.locator('[data-testid^="tab-close-"]')
    while ((await closes.count()) > 0) {
      const before = await closes.count()
      await closes.first().click()
      await expect.poll(async () => closes.count(), { timeout: 5_000 }).toBeLessThan(before)
    }
    await expect(page.getByTestId('right-pane')).toHaveCount(0)
    await page.request.get(
      `http://127.0.0.1:18799/debug/browser-exec?agentId=${id}&slug=ada&url=https://example.com/`,
    )
    await expect(page.getByTestId('tab-browser')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('browser-chrome')).toBeVisible()

    // Ctrl+` terminal
    await page.keyboard.press('Control+`')
    await expect(page.getByTestId('terminal-pane')).toBeVisible()

    // focus + terminal.read via fake daemon
    const tabId = await page.getByTestId('tab-terminal').getAttribute('data-tab-id')
    await page.getByTestId('tab-terminal').click()
    // seed buffer via terminal write
    await page.keyboard.type('echo prompt%')
    await page.keyboard.press('Enter')
    const readRes = await page.request.post('http://127.0.0.1:18799/debug/terminal-read', {
      data: { agentId: id },
    })
    const body = (await readRes.json()) as { ok?: boolean; text?: string; error?: string }
    expect(body.ok).toBe(true)
    expect(String(body.text ?? '').length).toBeGreaterThan(0)

    // close last tab closes pane
    const endCloses = page.locator('[data-testid^="tab-close-"]')
    while ((await endCloses.count()) > 0) {
      const before = await endCloses.count()
      await endCloses.first().click()
      await expect.poll(async () => endCloses.count(), { timeout: 5_000 }).toBeLessThan(before)
    }
    await expect(page.getByTestId('right-pane')).toHaveCount(0)

    await app.close()
  })
})
