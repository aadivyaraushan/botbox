#!/usr/bin/env node
/**
 * M5 real-daemon browser + terminal drive (not fake-daemon).
 * Human-side: chrome, URL, You’re driving, Ctrl+` terminal.
 * Agent-driven (MCP as Codex would call): needs-site→allow-site, stayHidden nav,
 * shell_run→visible Terminal (no focus steal), terminal_read.
 *
 * Run: CODEX_HOME=~/.openbot/codex-home pnpm exec tsx packages/app/scripts/m5-real-surface.mjs
 * Result: { ok, checks, home, port, daemon:'real', harness, agentId }
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { _electron as electron } from '@playwright/test'
import { WebSocket } from 'ws'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const appRoot = path.join(root, 'packages/app')
const port = Number(process.env.OPENBOT_PORT ?? 18845)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-m5-real-'))
fs.mkdirSync(path.join(home, 'hindsight', 'data'), { recursive: true })
fs.mkdirSync(path.join(home, 'codex-home'), { recursive: true })

const authSrc = path.join(sharedCodex, 'auth.json')
if (!fs.existsSync(authSrc)) {
  console.error('m5-real-surface: missing Codex auth at', authSrc)
  process.exit(1)
}
fs.copyFileSync(authSrc, path.join(home, 'codex-home', 'auth.json'))

const { Daemon } = await import(
  pathToFileURL(path.join(root, 'packages/daemon/src/daemon.ts')).href
)

const daemon = new Daemon({
  home,
  adminToken: token,
  port,
  skipHindsightSpawn: true,
})
const { port: bound } = await daemon.start()
console.error(`[daemon] listening 127.0.0.1:${bound}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function mcpCall(agentId, mcpToken, name, args) {
  const base = `http://127.0.0.1:${bound}/mcp/${agentId}?token=${mcpToken}`
  await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'm5-real-surface', version: '1' },
      },
    }),
  })
  const r = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const text = await r.text()
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
  const json = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  const content = json.result?.content?.[0]?.text
  return content ? JSON.parse(content) : json
}

function wsRequest(ws, body, timeoutMs = 30_000) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg.id === id && msg.type === 'response') {
        ws.off('message', onMsg)
        resolve(msg)
      }
    }
    ws.on('message', onMsg)
    ws.send(JSON.stringify({ id, ...body }))
    setTimeout(() => {
      ws.off('message', onMsg)
      reject(new Error('timeout ' + body.type))
    }, timeoutMs)
  })
}

async function main() {
  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:${bound}/?token=${token}`,
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: home,
      CODEX_HOME: path.join(home, 'codex-home'),
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')

  await page.getByTestId('new-agent').click()
  await page.getByTestId('new-agent-name').fill('PaneAda')
  await page.getByTestId('new-agent-submit').click()
  await page.waitForSelector('[data-testid="composer"]')

  const agentId =
    (await page.locator('[data-testid^="team-row-"]').first().getAttribute('data-testid'))?.replace(
      'team-row-',
      '',
    ) ?? ''
  if (!agentId) throw new Error('no agentId from team-row')

  const mcpToken = daemon.getMcpToken(agentId)
  if (!mcpToken) throw new Error('no mcp token for ' + agentId)

  const adminWs = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bound}/?token=${token}`)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
  const harnessRes = await wsRequest(adminWs, {
    type: 'agent.setHarness',
    agentId,
    harness: 'codex',
  })
  if (!harnessRes.ok) {
    throw new Error('agent.setHarness codex failed: ' + JSON.stringify(harnessRes))
  }
  adminWs.close()

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

  const humanChecks = {
    browserChrome,
    browserEnabled,
    terminalEnabled,
    urlNavigated: /example\.com/.test(urlAfterNav),
    drivingShown,
    terminalPane: await page.getByTestId('terminal-pane').isVisible(),
    drivingCleared: (await page.getByTestId('youre-driving').count()) === 0,
  }

  const navPromise = mcpCall(agentId, mcpToken, 'browser_navigate', {
    url: 'https://example.org/',
  })
  await page.waitForSelector('[data-testid="banner-needs-site"]', { timeout: 15_000 })
  const needsSiteShown = await page.getByTestId('banner-needs-site').isVisible()
  await page.getByTestId('allow-site').click()
  const navResult = await navPromise
  await page.getByTestId('tab-browser').first().click()
  let agentUrl = ''
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="browser-url"]')
        return el instanceof HTMLInputElement && /example\.org/.test(el.value)
      },
      { timeout: 15_000 },
    )
    agentUrl = await page.getByTestId('browser-url').inputValue()
  } catch {
    agentUrl = await page.getByTestId('browser-url').inputValue().catch(() => '')
  }
  const needsSiteAllow = Boolean(
    needsSiteShown &&
      navResult?.ok === true &&
      ( /example\.org/.test(agentUrl) ||
        String(navResult?.result?.url ?? '').includes('example.org') ) &&
      (await page.getByTestId('banner-needs-site').count()) === 0,
  )

  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w) throw new Error('no window')
    w.hide()
  })
  await sleep(300)
  const hiddenBefore = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return Boolean(w && !w.isVisible())
  })
  const stayNav = await mcpCall(agentId, mcpToken, 'browser_navigate', {
    url: 'https://example.org/',
  })
  await sleep(500)
  const stillHidden = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return Boolean(w && !w.isVisible())
  })
  const stayHiddenOk = Boolean(hiddenBefore && stillHidden && stayNav?.ok === true)

  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w?.show()
  })
  await page.waitForSelector('[data-testid="composer-input"]', { timeout: 10_000 })
  await page.getByTestId('composer-input').click()
  const focusedBefore = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'composer-input',
  )

  const shellMarker = `openbot-m5-agent-${Date.now()}`
  const shellResult = await mcpCall(agentId, mcpToken, 'shell_run', {
    command: `echo ${shellMarker}`,
    timeoutMs: 20_000,
  })
  await page.waitForSelector('[data-testid="tab-terminal"]', { timeout: 10_000 })
  const termTabVisible = await page.getByTestId('tab-terminal').first().isVisible()
  const focusedAfter = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') === 'composer-input',
  )
  const windowFocused = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    return Boolean(w?.isFocused())
  })
  const agentShellVisible = Boolean(
    shellResult &&
      (shellResult.exitCode === 0 || shellResult.ok !== false) &&
      termTabVisible &&
      focusedBefore &&
      (focusedAfter || windowFocused),
  )

  await page.getByTestId('tab-terminal').first().click()
  const typedMarker = `openbot-m5-typed-${Date.now()}`
  await page.keyboard.type(`echo ${typedMarker}`)
  await page.keyboard.press('Enter')
  await sleep(1000)
  const readResult = await mcpCall(agentId, mcpToken, 'terminal_read', {})
  const terminalReadOk = Boolean(
    readResult?.ok === true &&
      typeof readResult.text === 'string' &&
      (readResult.text.includes(typedMarker) ||
        readResult.text.includes(shellMarker) ||
        readResult.text.length > 0),
  )

  const checks = {
    ...humanChecks,
    needsSiteAllow,
    stayHidden: stayHiddenOk,
    agentShellVisible,
    terminalRead: terminalReadOk,
    harnessCodex: harnessRes.ok === true,
  }
  const ok = Object.values(checks).every(Boolean)
  const result = {
    ok,
    checks,
    home,
    port: bound,
    daemon: 'real',
    harness: 'codex',
    agentId,
    navResult,
    stayNav,
    shellResult: {
      exitCode: shellResult?.exitCode,
      tabId: shellResult?.tabId,
      outputSnippet: String(shellResult?.output ?? '').slice(-200),
    },
    readSnippet: String(readResult?.text ?? '').slice(-300),
    focusedBefore,
    focusedAfter,
  }
  console.log(JSON.stringify(result, null, 2))
  await app.close()
  await daemon.stop()
  process.exit(ok ? 0 : 1)
}

main().catch(async (err) => {
  console.error('m5-real-surface failed', err)
  try {
    await daemon.stop()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
