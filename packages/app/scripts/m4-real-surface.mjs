#!/usr/bin/env node
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const fakeDaemon = path.join(appRoot, 'e2e/fake-daemon.ts')
const tsx = path.join(appRoot, '../../node_modules/.bin/tsx')

const daemon = spawn(tsx, [fakeDaemon], {
  cwd: appRoot,
  env: { ...process.env, OPENBOT_ADMIN_TOKEN: 'test-token' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let log = ''
daemon.stdout?.on('data', (c) => {
  log += String(c)
})
daemon.stderr?.on('data', (c) => {
  log += String(c)
})

async function waitHealth(ms = 20000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    try {
      const res = await fetch('http://127.0.0.1:18799/health')
      if (res.ok) return
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('fake-daemon health timeout: ' + log.slice(-1500))
}

async function main() {
  await waitHealth()
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: 'ws://127.0.0.1:18799/?token=test-token&scenario=peer',
      OPENBOT_ALLOW_INTEL: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')

  await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
  const adaMarker = page.getByTestId('peer-marker')
  await adaMarker.waitFor()
  const adaText = await adaMarker.textContent()
  if (!adaText?.includes('Messaged Bea')) throw new Error('Ada missing Messaged Bea: ' + adaText)
  console.log('ada marker', adaText.trim())

  const beaRow = page.locator('[data-testid^="team-row-"]').filter({ hasText: 'Bea' })
  await beaRow.getByTestId('unread-dot').waitFor()
  console.log('bea unread visible while Ada selected')

  await page.getByTestId('agent-name').filter({ hasText: 'Bea' }).click()
  const beaMarker = page.getByTestId('peer-marker')
  await beaMarker.waitFor()
  const beaText = await beaMarker.textContent()
  if (!beaText?.includes('Message from Ada')) throw new Error('Bea missing Message from Ada: ' + beaText)
  if (!beaText?.includes('Please help')) throw new Error('Bea missing inbound text: ' + beaText)
  console.log('bea marker', beaText.trim())

  const clearStart = Date.now()
  while (Date.now() - clearStart < 5000) {
    const unreadLeft = await beaRow.getByTestId('unread-dot').count()
    if (unreadLeft === 0) break
    await new Promise((r) => setTimeout(r, 100))
  }
  if ((await beaRow.getByTestId('unread-dot').count()) !== 0) {
    throw new Error('Bea unread should clear after select')
  }
  console.log('real-surface ok')

  await app.close()
  daemon.kill('SIGTERM')
  process.exit(0)
}

main().catch(async (err) => {
  console.error('real-surface failed', err)
  try {
    daemon.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
