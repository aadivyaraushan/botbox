#!/usr/bin/env node
/**
 * M4 real-surface: two live Codex agents, A messages B via real Daemon MCP.
 * Not fake-daemon. Claude weekly-capped — Codex+Codex only.
 *
 * Peer send uses Ada's openbot MCP token from her Codex config.toml (same
 * message_agent path the harness uses). A live Codex turn is started first so
 * the sent marker lands on an in-flight assistant row.
 *
 * Requires: CODEX_HOME=~/.openbot/codex-home with auth.json (ChatGPT login).
 * Temp OPENBOT_HOME; OPENBOT_SKIP_HINDSIGHT=1 (memory is p4-hindsight).
 *
 * Run: CODEX_HOME=~/.openbot/codex-home node packages/app/scripts/m4-real-surface.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { _electron as electron } from '@playwright/test'
import {
  PEER_BODY,
  ensureCodexAuth,
  findPeerMessageEvent,
  evidencePayload,
  parseOpenbotMcpFromConfig,
  callMessageAgentMcp,
} from './m4-live-peer-helpers.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const appRoot = path.join(root, 'packages/app')
const port = Number(process.env.OPENBOT_PORT ?? 18874)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-m4-live-'))
fs.mkdirSync(path.join(home, 'hindsight', 'data'), { recursive: true })

const auth = ensureCodexAuth(sharedCodex, home)
if (!auth.ok) {
  console.error('m4-real-surface: missing Codex auth at', auth.authSrc)
  console.error('Run: CODEX_HOME=~/.openbot/codex-home codex login --device-auth')
  process.exit(1)
}

const tsx = path.join(root, 'node_modules/.bin/tsx')
const daemon = spawn(tsx, [path.join(appRoot, 'scripts/start-real-daemon.mjs')], {
  cwd: path.join(root, 'packages/daemon'),
  env: {
    ...process.env,
    OPENBOT_HOME: home,
    OPENBOT_ADMIN_TOKEN: token,
    OPENBOT_PORT: String(port),
    CODEX_HOME: path.join(home, 'codex-home'),
    OPENBOT_SKIP_HINDSIGHT: '1',
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

function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`)
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function request(ws, body, timeoutMs = 180_000) {
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
    setTimeout(() => reject(new Error('timeout ' + body.type)), timeoutMs)
  })
}

async function setCodex(ws, agentId) {
  const sw = await request(ws, { type: 'agent.setHarness', agentId, harness: 'codex' })
  if (!sw.ok) throw new Error('setHarness failed ' + JSON.stringify(sw))
  const got = await request(ws, { type: 'agent.get', agentId })
  if (!got.ok || got.agent?.harness !== 'codex') {
    throw new Error('agent not on codex: ' + JSON.stringify(got))
  }
}

async function readOpenbotMcp(slug) {
  const cfgPath = path.join(home, 'private', slug, 'codex-home', 'config.toml')
  const deadline = Date.now() + 30_000
  while (!fs.existsSync(cfgPath) && Date.now() < deadline) {
    await sleep(100)
  }
  if (!fs.existsSync(cfgPath)) throw new Error('missing Codex config ' + cfgPath)
  const toml = fs.readFileSync(cfgPath, 'utf8')
  const mcp = parseOpenbotMcpFromConfig(toml)
  if (!mcp) throw new Error('could not parse openbot MCP from ' + cfgPath)
  return mcp
}

async function main() {
  await waitListening()
  const ws = await connect()
  /** @type {unknown[]} */
  const events = []
  ws.on('message', (raw) => {
    try {
      events.push(JSON.parse(String(raw)))
    } catch {
      /* ignore */
    }
  })
  await request(ws, { type: 'event.stream' })

  const adaCreated = await request(ws, { type: 'agent.create', name: 'Ada' })
  if (!adaCreated.ok) throw new Error('create Ada failed ' + JSON.stringify(adaCreated))
  const beaCreated = await request(ws, { type: 'agent.create', name: 'Bea' })
  if (!beaCreated.ok) throw new Error('create Bea failed ' + JSON.stringify(beaCreated))
  const adaId = adaCreated.agent.id
  const beaId = beaCreated.agent.id
  const adaSlug = adaCreated.agent.slug

  await setCodex(ws, adaId)
  await setCodex(ws, beaId)
  console.error('[m4] agents on codex', { adaId, beaId, home, port })

  const userDataDir = path.join(home, 'electron-user-data')
  fs.mkdirSync(userDataDir, { recursive: true })
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:${port}/?token=${token}`,
      OPENBOT_ALLOW_INTEL: '1',
      OPENBOT_HOME: home,
    },
    timeout: 90_000,
  })
  const page = await app.firstWindow({ timeout: 90_000 })
  await page.waitForSelector('[data-testid="team-column"]')
  await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
  await page.waitForSelector('[data-testid="composer"]')

  const turn = await request(ws, {
    type: 'chat.send',
    agentId: adaId,
    text: 'Reply with exactly the word READY. Do not call tools.',
  })
  if (!turn.ok) throw new Error('chat.send failed ' + JSON.stringify(turn))
  console.error('[m4] live Codex turn started')

  const adaMcp = await readOpenbotMcp(adaSlug)
  await sleep(300)
  const mcpResult = await callMessageAgentMcp({
    port,
    agentId: adaId,
    token: adaMcp.token,
    toAgentId: beaId,
    text: PEER_BODY,
  })
  if (!mcpResult?.ok) {
    throw new Error('message_agent MCP failed ' + JSON.stringify(mcpResult))
  }
  console.error('[m4] message_agent ok', mcpResult)

  const peerDeadline = Date.now() + 30_000
  let sentEv = null
  let recvEv = null
  while (Date.now() < peerDeadline) {
    sentEv = findPeerMessageEvent(events, {
      agentId: adaId,
      direction: 'sent',
      peerName: 'Bea',
      textIncludes: PEER_BODY,
    })
    recvEv = findPeerMessageEvent(events, {
      agentId: beaId,
      direction: 'received',
      peerName: 'Ada',
      textIncludes: PEER_BODY,
    })
    if (sentEv && recvEv) break
    await sleep(200)
  }
  if (!sentEv || !recvEv) {
    throw new Error(
      'peer delivery missing sent=' +
        Boolean(sentEv) +
        ' recv=' +
        Boolean(recvEv) +
        ' log=' +
        daemonLog.slice(-2000),
    )
  }
  console.error('[m4] peer WS events ok')

  await page.getByTestId('agent-name').filter({ hasText: 'Ada' }).click()
  const adaMarker = page.getByTestId('peer-marker')
  await adaMarker.waitFor({ timeout: 60_000 })
  const adaText = await adaMarker.textContent()
  if (!adaText?.includes('Messaged Bea')) throw new Error('Ada missing Messaged Bea: ' + adaText)
  console.log('ada marker', adaText.trim())

  const beaRow = page.locator('[data-testid^="team-row-"]').filter({ hasText: 'Bea' })
  await beaRow.getByTestId('unread-dot').waitFor({ timeout: 30_000 })
  console.log('bea unread visible while Ada selected')

  await page.getByTestId('agent-name').filter({ hasText: 'Bea' }).click()
  const beaMarker = page.getByTestId('peer-marker')
  await beaMarker.waitFor({ timeout: 30_000 })
  const beaText = await beaMarker.textContent()
  if (!beaText?.includes('Message from Ada')) throw new Error('Bea missing Message from Ada: ' + beaText)
  if (!beaText?.includes(PEER_BODY)) throw new Error('Bea missing inbound text: ' + beaText)
  console.log('bea marker', beaText.trim())

  const clearStart = Date.now()
  while (Date.now() - clearStart < 5000) {
    if ((await beaRow.getByTestId('unread-dot').count()) === 0) break
    await sleep(100)
  }
  if ((await beaRow.getByTestId('unread-dot').count()) !== 0) {
    throw new Error('Bea unread should clear after select')
  }

  await request(ws, { type: 'chat.stop', agentId: adaId }).catch(() => {})
  await request(ws, { type: 'chat.stop', agentId: beaId }).catch(() => {})

  const result = evidencePayload({
    ok: true,
    adaId,
    beaId,
    home,
    port,
    auth: auth.authDest,
    adaMarker: adaText.trim(),
    beaMarker: beaText.trim(),
    peerSent: true,
    peerReceived: true,
    peerVia: 'mcp-message_agent',
    liveCodexTurn: true,
  })
  console.log(JSON.stringify(result, null, 2))
  console.log('real-surface ok')

  await Promise.race([app.close(), sleep(5000)]).catch(() => {})
  try {
    ws.close()
  } catch {
    /* ignore */
  }
  daemon.kill('SIGTERM')
  setTimeout(() => process.exit(0), 500).unref()
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
