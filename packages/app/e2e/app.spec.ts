import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: 'ws://127.0.0.1:18799/?token=test-token&scenario=app',
      OPENBOT_ALLOW_INTEL: '1',
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

test.describe('OpenBot M2 app', () => {
  test('empty team, new agent, reasoning, composer locks, slash, right pane, tray', async () => {
    const { app, page } = await launch()

    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    await expect(page.getByTestId('new-agent')).toHaveText('New agent')
    await expect(page.getByTestId('team-column').getByText('Add someone, then give them work.')).toBeVisible()

    // File → New agent via menu API
    await clickMenu(app, ['File', 'New agent'])
    await expect(page.getByRole('dialog', { name: 'New agent' })).toBeVisible()
    await page.keyboard.press('Escape')

    // description-only create
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-description').fill('Research the repo')
    await page.getByTestId('new-agent-name').blur()
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name')).toBeVisible()

    // fixture compact divider from history
    await expect(page.getByTestId('compact-divider')).toContainText('Context compacted')

    // View → Browser opens chrome (M5)
    await clickMenu(app, ['View', 'Browser'])
    await expect(page.getByTestId('browser-chrome')).toBeVisible()

    // composer controls inside composer, not top toolbar
    const composer = page.getByTestId('composer')
    await expect(composer.getByTestId('model-picker')).toBeVisible()
    await expect(composer.getByTestId('context-donut')).toBeVisible()
    await expect(composer.getByTestId('spend-chip')).toBeVisible()
    await expect(composer.getByTestId('composer-primary')).toBeVisible()
    await expect(page.locator('[data-testid="top-toolbar"]')).toHaveCount(0)
    await expect(composer.getByRole('button', { name: 'Pause' })).toHaveCount(0)

    // harness switcher above composer
    await expect(page.getByTestId('harness-switcher')).toBeVisible()

    // send → reasoning row + working
    await page.getByTestId('composer-input').fill('Hello')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('reasoning-row')).toContainText('Working.')
    await expect(page.getByTestId('agent-status')).toHaveText('working')
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'stop')

    // Enter while thinking queues (chat.send) and primary stays stop
    await page.getByTestId('composer-input').fill('Queued please')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'stop')

    // stop → pause
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'resume')
    await expect(page.getByTestId('agent-status')).toHaveText('paused')

    // Enter while paused does not send; shows Resume to send
    await page.getByTestId('composer-input').fill('Should stay')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('resume-hint')).toHaveText('Resume to send')
    await expect(page.getByTestId('composer-input')).toHaveValue('Should stay')

    // resume click
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('composer-input')).toHaveValue('Should stay')

    // idle path: create second agent Thinking/Paused fixtures via new agent names
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('PausedBea')
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name').filter({ hasText: 'Bea' }).first()).toBeVisible()

    // select first agent again for slash tests
    await page.locator('[data-testid^="team-row-"]').first().click()
    await page.getByTestId('composer-input').fill('/compact')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('compact-divider').last()).toContainText('Context compacted')

    // /model opens picker
    await page.getByTestId('composer-input').fill('/model')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('model-picker').locator('.slash-menu')).toBeVisible()

    // skill /draft
    await page.getByTestId('composer-input').fill('/draft')
    await page.getByTestId('composer-input').press('Enter')

    // unknown command
    await page.getByTestId('composer-input').fill('/nope')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('slash-error')).toContainText('Unknown command')

    // no /plan in slash list when opening /
    await page.getByTestId('composer-input').fill('/')
    await expect(page.getByTestId('slash-menu')).toBeVisible()
    await expect(page.getByTestId('slash-menu')).not.toContainText('/plan')

    // plus menu disabled Coming later
    await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
    const plus = page.getByTestId('plus-menu').locator('.plus-menu-list')
    await expect(plus.getByRole('button', { name: 'Terminal' })).toBeEnabled()
    await expect(plus.getByRole('button', { name: 'Browser' })).toBeEnabled()
    await expect(plus.getByRole('button', { name: 'Files' })).toBeDisabled()
    await expect(plus.getByRole('button', { name: 'Files' })).toHaveAttribute(
      'title',
      'Coming in a later build',
    )

    // needs-login path
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('LoggedOutCara')
    await page.getByTestId('new-agent-submit').click()
    await expect(page.getByTestId('agent-name').filter({ hasText: 'Cara' })).toBeVisible()
    await page.getByTestId('agent-name').filter({ hasText: 'Cara' }).click()
    await expect(page.getByTestId('banner-needs-login')).toBeVisible()
    await page.getByTestId('composer-input').fill('Hi while logged out')
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'send')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('composer-input')).toHaveValue('Hi while logged out')
    await expect(page.getByTestId('banner-needs-login')).toBeVisible()
    await page.getByTestId('banner-login').first().click()

    // rename keeps slug
    await page.getByTestId('agent-name').filter({ hasText: 'Research' }).or(page.getByTestId('agent-name').first()).first().click()
    await page.locator('[data-testid^="team-row-"]').first().getByRole('button', { name: 'Agent menu' }).click()
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByTestId('rename-input').fill('AdaPrime')
    await page.getByTestId('rename-submit').click()
    await expect(page.getByTestId('agent-name').first()).toHaveText('AdaPrime')

    // tray unread via evaluate
    const unread = await app.evaluate(async () => {
      const g = globalThis as unknown as {
        unread: { set: (o: { count: number }) => void }
        getTrayUnread: () => boolean
      }
      g.unread.set({ count: 1 })
      return g.getTrayUnread()
    })
    expect(unread).toBe(true)

    // accessible names on primary
    await page.locator('[data-testid^="team-row-"]').first().click()
    // empty send disabled when idle+empty
    await page.getByTestId('composer-input').fill('')
    // may be thinking/paused depending on prior; create idle agent
    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('IdleDee')
    await page.getByTestId('new-agent-submit').click()
    await page.getByTestId('agent-name').filter({ hasText: 'IdleDee' }).click()
    await page.getByTestId('composer-input').fill('')
    await expect(page.getByTestId('composer-primary')).toBeDisabled()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('aria-label', 'Send message')

    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('ThinkingEve')
    await page.getByTestId('new-agent-submit').click()
    await page.getByTestId('agent-name').filter({ hasText: 'Eve' }).click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('aria-label', 'Stop agent')

    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-name').fill('MemorizingFay')
    await page.getByTestId('new-agent-submit').click()
    await page.getByTestId('agent-name').filter({ hasText: 'Fay' }).click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'disabled-stop')
    await page.getByTestId('composer-input').fill('While mem')
    await page.getByTestId('composer-input').press('Enter')

    await app.close()
  })
})
