#!/usr/bin/env node
/**
 * M6 real-daemon Files drive (not fake-daemon).
 * Spawn real Daemon → Electron → New agent → Files list/preview/Cmd+P/second tab.
 *
 * Callers: manual / orchestrate gap-codex-surface (`node packages/app/scripts/m6-real-surface.mjs`).
 * Result shape: { ok, saveCount, focused, tabs, browserProfile, home, port }
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
const port = Number(process.env.OPENBOT_PORT ?? 18844)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-m6-real-'))
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
  await page.getByTestId('new-agent-name').fill('FilesAda')
  await page.getByTestId('new-agent-submit').click()
  await page.waitForSelector('[data-testid="composer"]')

  await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
  if (!(await page.getByTestId('plus-files').isEnabled())) {
    throw new Error('Files not enabled in + menu')
  }
  await page.getByTestId('plus-files').click()
  await page.waitForSelector('[data-testid="files-pane"]')

  await page.getByTestId('file-row-role.md').waitFor()
  await page.getByTestId('file-row-MEMORY.md').waitFor()
  const browserProfile = await page.locator('[data-testid*="browser-profile"]').count()

  await page.getByTestId('file-row-role.md').click()
  await page.getByTestId('files-preview').waitFor()
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-testid="files-preview"]')
      return Boolean(el?.textContent && el.textContent.includes('FilesAda'))
    },
    { timeout: 10_000 },
  )
  const preview = (await page.getByTestId('files-preview').textContent()) ?? ''
  if (!preview.includes('FilesAda')) throw new Error('role.md preview missing agent name')
  const saveCount = await page.getByTestId('files-save').count()

  await page.keyboard.press('Meta+p')
  const focused = await page.getByTestId('files-search').evaluate((el) => document.activeElement === el)

  await page.getByTestId('plus-menu').getByRole('button', { name: 'Add tab' }).click()
  await page.getByTestId('plus-files').click()
  const tabs = await page.getByTestId('tab-files').count()

  const result = {
    ok: saveCount === 0 && focused && tabs === 2 && browserProfile === 0,
    saveCount,
    focused,
    tabs,
    browserProfile,
    home,
    port,
  }
  console.log(JSON.stringify(result))
  await app.close()
  daemon.kill('SIGTERM')
  process.exit(result.ok ? 0 : 1)
}

main().catch(async (err) => {
  console.error('m6-real-surface failed', err)
  try {
    daemon.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
