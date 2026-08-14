import { test, expect } from '@playwright/test'
import {
  launchApp,
  waitForAgentName,
  createNamedAgent,
  clearDaemonRequests,
  daemonRequests,
  clickMenu,
} from './helpers'

test.describe('OpenBot M2 app shell', () => {
  test('empty team and new agent flow', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
    await expect(page.getByTestId('new-agent')).toHaveText('New agent')
    await expect(page.getByTestId('team-column').getByText('Add someone, then give them work.')).toBeVisible()

    await clickMenu(app, ['File', 'New agent'])
    await expect(page.getByRole('dialog', { name: 'New agent' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByTestId('new-agent').click()
    await page.getByTestId('new-agent-description').fill('Research the repo')
    await page.getByTestId('new-agent-name').blur()
    await page.getByTestId('new-agent-submit').click()
    await waitForAgentName(page, 'Research')
    await expect(page.getByTestId('compact-divider')).toContainText('Context compacted')

    await clickMenu(app, ['View', 'Browser'])
    await expect(page.getByTestId('browser-chrome')).toBeVisible()

    const composer = page.getByTestId('composer')
    await expect(composer.getByTestId('model-picker')).toBeVisible()
    await expect(composer.getByTestId('context-donut')).toBeVisible()
    await expect(composer.getByTestId('spend-chip')).toBeVisible()
    await expect(composer.getByTestId('composer-primary')).toBeVisible()
    await expect(page.locator('[data-testid="top-toolbar"]')).toHaveCount(0)
    await expect(composer.getByRole('button', { name: 'Pause' })).toHaveCount(0)
    await expect(page.getByTestId('harness-switcher')).toBeVisible()
    await app.close()
  })

  test('send shows reasoning and stop mode', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await page.getByTestId('composer-input').fill('Hello')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('reasoning-row')).toContainText('Working.')
    await expect(page.getByTestId('agent-status')).toHaveText('working')
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'stop')
    await app.close()
  })

  test('Enter while thinking queues and shows Queued', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await clearDaemonRequests()
    await page.getByTestId('composer-input').fill('Hello')
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'stop')
    await page.getByTestId('composer-input').fill('Queued please')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'stop')
    await expect(page.getByText('Queued').first()).toBeVisible()
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'chat.send' && r.text === 'Queued please')
      })
      .toBe(true)
    await app.close()
  })

  test('Enter while memorising queues and shows Queued', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'MemorizingFay')
    await page.getByTestId('agent-name').filter({ hasText: 'Fay' }).click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'disabled-stop')
    await clearDaemonRequests()
    await page.getByTestId('composer-input').fill('While mem')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByText('Queued').first()).toBeVisible()
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'chat.send' && r.text === 'While mem')
      })
      .toBe(true)
    await app.close()
  })

  test('paused Enter shows Resume to send', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await page.getByTestId('composer-input').fill('Hello')
    await page.getByTestId('composer-primary').click()
    await page.getByTestId('composer-primary').click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'resume')
    await page.getByTestId('composer-input').fill('Should stay')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('resume-hint')).toHaveText('Resume to send')
    await expect(page.getByTestId('composer-input')).toHaveValue('Should stay')
    await app.close()
  })

  test('/draft sends chat.send with Draft it.', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await clearDaemonRequests()
    await page.getByTestId('composer-input').fill('/draft')
    await page.getByTestId('composer-input').press('Enter')
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'chat.send' && r.text === 'Draft it.')
      })
      .toBe(true)
    await app.close()
  })

  test('Log in banner sends harness.startLogin', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'LoggedOutCara')
    await page.getByTestId('agent-name').filter({ hasText: 'Cara' }).click()
    await expect(page.getByTestId('banner-needs-login')).toBeVisible()
    await clearDaemonRequests()
    await page.getByTestId('banner-login').first().click()
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'harness.startLogin')
      })
      .toBe(true)
    await app.close()
  })

  test('rename keeps slug via agent.get', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await page.locator('[data-testid^="team-row-"]').first().getByRole('button', { name: 'Agent menu' }).click()
    await page.getByRole('button', { name: 'Rename' }).click()
    await page.getByTestId('rename-input').fill('AdaPrime')
    await page.getByTestId('rename-submit').click()
    await expect(page.getByTestId('agent-name').filter({ hasText: 'AdaPrime' })).toBeVisible()
    const slugCheck = await page.evaluate(async () => {
      const row = document.querySelector('[data-testid^="team-row-"]')
      const agentId = row?.getAttribute('data-testid')?.replace('team-row-', '') ?? ''
      return (await window.openbot.request({
        id: crypto.randomUUID(),
        type: 'agent.get',
        agentId,
      })) as { ok?: boolean; agent?: { name?: string; slug?: string } }
    })
    expect(slugCheck.ok).toBe(true)
    expect(slugCheck.agent?.name).toBe('AdaPrime')
    expect(slugCheck.agent?.slug).toBe('ada')
    await app.close()
  })

  test('model picker fed by agent.models and sends agent.setModel', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'agent.models')
      })
      .toBe(true)
    await clearDaemonRequests()
    await page.getByTestId('model-picker').getByRole('button', { name: 'Model picker' }).click()
    await page.getByTestId('model-picker').getByRole('button', { name: 'Opus 4', exact: true }).click()
    await expect
      .poll(async () => {
        const reqs = await daemonRequests()
        return reqs.some((r) => r.type === 'agent.setModel' && r.model === 'claude-opus-4')
      })
      .toBe(true)
    await app.close()
  })

  test('needs-you counts toward tray attention', async () => {
    const { app, page } = await launchApp({ scenario: 'ask' })
    await waitForAgentName(page, 'Ada')
    await expect
      .poll(async () => {
        return await app.evaluate(async () => {
          const g = globalThis as unknown as { getTrayUnread: () => boolean }
          return g.getTrayUnread()
        })
      })
      .toBe(true)
    await app.close()
  })

  test('slash unknown and no /plan; plus menu tabs', async () => {
    const { app, page } = await launchApp({ scenario: 'app' })
    await createNamedAgent(page, 'Ada')
    await page.getByTestId('composer-input').fill('/nope')
    await page.getByTestId('composer-input').press('Enter')
    await expect(page.getByTestId('slash-error')).toContainText('Unknown command')
    await page.getByTestId('composer-input').fill('/')
    await expect(page.getByTestId('slash-menu')).toBeVisible()
    await expect(page.getByTestId('slash-menu')).not.toContainText('/plan')
    await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
    const plus = page.getByTestId('plus-menu').locator('.plus-menu-list')
    await expect(plus.getByRole('button', { name: 'Terminal' })).toBeEnabled()
    await expect(plus.getByRole('button', { name: 'Browser' })).toBeEnabled()
    await expect(plus.getByRole('button', { name: 'Files' })).toBeEnabled()
    await app.close()
  })
})
