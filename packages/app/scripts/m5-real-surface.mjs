#!/usr/bin/env node
/**
 * M5 real-daemon browser + terminal drive (not fake-daemon).
 * Fake chrome smoke stays in e2e/real-window-drive.mjs — do not count that alone as harness verify.
 *
 * Callers: manual / orchestrate gap-codex-surface (`node packages/app/scripts/m5-real-surface.mjs`).
 * Result shape: { ok, checks, home, port, daemon: 'real' }
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const appRoot = path.join(root, 'packages/app')
const port = Number(process.env.OPENBOT_PORT ?? 18845)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-m5-real-'))
fs.mkdirSync(path.join(home, 'hindsight', 'data'), { recursive: true })

const tsx = path.join(root, 'node_modules/.bin/tsx')
const daemon = spawn(tsx, [path.join(appRoot, 'scripts/start-real-daemon.mjs')], {
  cwd: path.join(root, 'packages/daemon'),
  env: {
    ...process.env,
    OPENBOT_HOME: home,
    OPENBOT_ADMIN_TOKEN: token,
    OPENBOT_PORT: String(port),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let daemonLog = ''
daemon.stderr?.on('data', (c) => {
  daemonLog += String(c)
  process.stderr.write(c)
})
daemon.stdout?.on('data', (c) => {
  daemonLog += String(c)
  process.stdout.write(c)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitListening(ms = 45000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (daemonLog.includes('listening')) return
    if (daemon.exitCode != null) throw new Error('daemon exited early: ' + daemonLog.slice(-2000))
    await sleep(200)
  }
  throw new Error('daemon did not listen: ' + daemonLog.slice(-2000))
}

async function clickMenu(app, labels) {
  await app.evaluate(async ({ Menu }, pathLabels) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('no application menu')
    let current = menu
    for (let i = 0; i < pathLabels.length; i++) {
      const label = pathLabels[i]
      const item = (current?.items ?? []).find((it) => it.label === label)
      if (!item) throw new Error(`menu item not found: ${pathLabels.slice(0, i + 1).join(' > ')}`)
      if (i === pathLabels.length - 1) {
        item.click()
        return
      }
      current = item.submenu
      if (!current) throw new Error(`no submenu for ${label}`)
    }
  }, labels)
}

async function main() {
  await waitListening()
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:${port}/?token=${token}`,
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: home,
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')

  await page.getByTestId('new-agent').click()
  await page.getByTestId('new-agent-name').fill('PaneAda')
  await page.getByTestId('new-agent-submit').click()
  await page.waitForSelector('[data-testid="composer"]')

  await clickMenu(app, ['View', 'Browser'])
  await page.waitForSelector('[data-testid="browser-chrome"]')
  const browserChrome = await page.getByTestId('browser-chrome').isVisible()

  await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
  const browserEnabled = await page.getByTestId('plus-browser').isEnabled()
  const terminalEnabled = await page.getByTestId('plus-terminal').isEnabled()
  await page.keyboard.press('Escape').catch(() => {})

  await page.getByTestId('browser-url').fill('https://example.com/')
  await page.getByTestId('browser-url').press('Enter')
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="browser-url"]')
      return el instanceof HTMLInputElement && /example\.com/.test(el.value)
    },
    { timeout: 30_000 },
  )
  const urlAfterNav = await page.getByTestId('browser-url').inputValue()

  await page.getByTestId('take-control').click()
  await page.waitForSelector('[data-testid="youre-driving"]')
  const drivingShown = await page.getByTestId('youre-driving').isVisible()
  await page.getByTestId('return-control').click()
  await page.waitForSelector('[data-testid="youre-driving"]', { state: 'detached' })

  await page.keyboard.press('Control+`')
  await page.waitForSelector('[data-testid="terminal-pane"]')
  await page.getByTestId('tab-terminal').click()
  await page.keyboard.type('echo openbot-m5-real')
  await page.keyboard.press('Enter')
  await sleep(800)

  const checks = {
    browserChrome,
    browserEnabled,
    terminalEnabled,
    urlNavigated: /example\.com/.test(urlAfterNav),
    drivingShown,
    terminalPane: await page.getByTestId('terminal-pane').isVisible(),
    drivingCleared: (await page.getByTestId('youre-driving').count()) === 0,
  }
  const ok = Object.values(checks).every(Boolean)
  const result = { ok, checks, home, port, daemon: 'real' }
  console.log(JSON.stringify(result, null, 2))
  await app.close()
  daemon.kill('SIGTERM')
  process.exit(ok ? 0 : 1)
}

main().catch(async (err) => {
  console.error('m5-real-surface failed', err)
  try {
    daemon.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
