import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

async function launch(scenario = 'ask'): Promise<{ app: ElectronApplication; page: Page }> {
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

async function lastAskAnswer(): Promise<Record<string, unknown> | null> {
  const res = await fetch('http://127.0.0.1:18799/debug/last-ask-answer')
  if (!res.ok) return null
  return (await res.json()) as Record<string, unknown> | null
}

async function selectAda(page: Page) {
  await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
  await expect(page.getByTestId('ask-card')).toBeVisible()
}

test.describe('OpenBot M3 ask cards', () => {
  test('fixture ask-user-question renders options', async () => {
    const { app, page } = await launch()
    await selectAda(page)
    await expect(page.getByTestId('ask-question-text').first()).toContainText('Ship today or tomorrow?')
    await expect(page.getByTestId('ask-option').filter({ hasText: 'Today' })).toBeVisible()
    await expect(page.getByTestId('ask-option').filter({ hasText: 'Tomorrow' })).toBeVisible()
    await expect(page.getByTestId('ask-option').filter({ hasText: 'Today' })).toContainText('Recommended')
    await expect(page.getByTestId('ask-other')).toBeVisible()
    await expect(page.getByTestId('ask-answer-in-chat')).toBeVisible()
    await app.close()
  })

  test('one-question click sends ask.answer keyed on question text', async () => {
    const { app, page } = await launch()
    await selectAda(page)
    await page.getByTestId('ask-option').filter({ hasText: 'Today' }).click()
    await expect.poll(async () => lastAskAnswer()).toMatchObject({
      type: 'ask.answer',
      answers: { 'Ship today or tomorrow?': 'Today' },
    })
    await expect(page.getByTestId('ask-card')).toHaveAttribute('data-status', 'answered')
    await app.close()
  })

  test('two-question card waits for second answer before ask.answer', async () => {
    const { app, page } = await launch('ask-two')
    await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
    await expect(page.getByTestId('ask-card')).toBeVisible()
    await page.getByTestId('ask-option').filter({ hasText: 'Today' }).click()
    await expect(page.getByTestId('ask-card')).toHaveAttribute('data-status', 'open')
    expect(await lastAskAnswer()).toBeNull()
    await page.getByTestId('ask-option').filter({ hasText: 'Red' }).click()
    await expect.poll(async () => lastAskAnswer()).toMatchObject({
      type: 'ask.answer',
      answers: {
        'Ship today or tomorrow?': 'Today',
        'Which color?': 'Red',
      },
    })
    await app.close()
  })

  test('multiSelect requires Done', async () => {
    const { app, page } = await launch('ask-multi')
    await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
    await expect(page.getByTestId('ask-card')).toBeVisible()
    await page.getByTestId('ask-option').filter({ hasText: 'Cheese' }).click()
    expect(await lastAskAnswer()).toBeNull()
    await page.getByTestId('ask-option').filter({ hasText: 'Onion' }).click()
    expect(await lastAskAnswer()).toBeNull()
    await page.getByTestId('ask-multi-done').click()
    await expect.poll(async () => lastAskAnswer()).toMatchObject({
      type: 'ask.answer',
      answers: { 'Pick toppings': 'Cheese, Onion' },
    })
    await app.close()
  })

  test('Other sends typed text as the answer value', async () => {
    const { app, page } = await launch()
    await selectAda(page)
    await page.getByTestId('ask-other').click()
    await page.getByTestId('ask-other-input').fill('Next week')
    await page.getByTestId('ask-other-submit').click()
    await expect.poll(async () => lastAskAnswer()).toMatchObject({
      type: 'ask.answer',
      answers: { 'Ship today or tomorrow?': 'Next week' },
    })
    const body = await lastAskAnswer()
    expect(JSON.stringify(body)).not.toContain('"Other"')
    expect(body).not.toHaveProperty('response')
    await app.close()
  })

  test('Answer in chat instead then composer send uses response', async () => {
    const { app, page } = await launch()
    await selectAda(page)
    await page.getByTestId('ask-answer-in-chat').click()
    await expect(page.getByTestId('composer-primary')).toHaveAttribute('data-mode', 'send')
    await page.getByTestId('composer-input').fill('Do whatever you think is best')
    await page.getByTestId('composer-primary').click()
    await expect.poll(async () => lastAskAnswer()).toMatchObject({
      type: 'ask.answer',
      answers: {},
      response: 'Do whatever you think is best',
    })
    await app.close()
  })
})
