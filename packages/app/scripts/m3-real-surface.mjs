#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { WebSocket } from 'ws'
import { encodeFrame, decodeFrame } from '@openbot/daemon/wire'
import { _electron as electron } from '@playwright/test'

const root = '/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m3'
const appRoot = path.join(root, 'packages/app')
const port = 18899
const token = randomBytes(16).toString('hex')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-m3-'))
const claudeDir = path.join(home, 'claude-config')
fs.mkdirSync(claudeDir, { recursive: true })
fs.mkdirSync(path.join(home, 'hindsight', 'data'), { recursive: true })

const srcCred = path.join(os.homedir(), '.claude', '.credentials.json')
if (!fs.existsSync(srcCred)) {
  console.error('real-surface: missing ~/.claude/.credentials.json')
  process.exit(1)
}
fs.copyFileSync(srcCred, path.join(claudeDir, '.credentials.json'))

const daemon = spawn(
  path.join(root, 'node_modules/.bin/tsx'),
  [path.join(root, 'packages/app/scripts/m3-start-daemon.mjs')],
  {
    cwd: path.join(root, 'packages/daemon'),
    env: {
      ...process.env,
      OPENBOT_HOME: home,
      OPENBOT_ADMIN_TOKEN: token,
      OPENBOT_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let daemonLog = ''
daemon.stderr.on('data', (c) => {
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
    await sleep(250)
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

function request(ws, body) {
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const decoded = decodeFrame(String(raw))
      if (!decoded.ok) return
      const m = decoded.value
      if (m.id === id && m.type === 'response') {
        ws.off('message', onMsg)
        resolve(m)
      }
    }
    ws.on('message', onMsg)
    ws.send(encodeFrame({ id, ...body }))
    setTimeout(() => reject(new Error('timeout ' + body.type)), 90000)
  })
}

async function main() {
  await waitListening()
  const ws = await connect()
  await request(ws, { type: 'event.stream' })
  const created = await request(ws, { type: 'agent.create', name: 'AdaAsk' })
  if (!created.ok) throw new Error('create failed ' + created.error)
  const agentId = created.agent.id

  const askPrompt =
    'Ask me one question using the AskUserQuestion tool: "Ship today or tomorrow?" with two options labelled "Today" and "Tomorrow". Do not answer in prose. Call the tool.'

  let askPartId = null
  const askSeen = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no ask-user-question within 180s')), 180000)
    ws.on('message', (raw) => {
      const decoded = decodeFrame(String(raw))
      if (!decoded.ok) return
      const m = decoded.value
      const ev = m.event
      if (m.channel === 'harness' && ev?.kind === 'ask-user-question') {
        askPartId = ev.partId
        clearTimeout(t)
        resolve(ev)
      }
    })
  })

  const sent = await request(ws, { type: 'chat.send', agentId, text: askPrompt })
  if (!sent.ok) throw new Error('chat.send failed ' + sent.error)
  const askEv = await askSeen
  console.log('ask event', askEv.partId, askEv.questions?.[0]?.question)

  const app = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      OPENBOT_DAEMON_WS: `ws://127.0.0.1:${port}/?token=${token}`,
      OPENBOT_ALLOW_INTEL: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForSelector('[data-testid="team-column"]')
  await page.getByTestId('agent-name').filter({ hasText: 'AdaAsk' }).click()
  await page.waitForSelector('[data-testid="ask-card"]', { timeout: 30000 })
  const q = page.getByTestId('ask-question-text').first()
  await q.waitFor()
  console.log('card text', await q.textContent())
  await page.getByTestId('ask-option').filter({ hasText: 'Today' }).click()
  await page.waitForSelector('[data-testid="ask-card"][data-status="answered"]', { timeout: 30000 })
  console.log('real-surface ok partId=', askPartId)
  await app.close()
  ws.close()
  daemon.kill('SIGTERM')
  process.exit(0)
}

main().catch(async (err) => {
  console.error('real-surface failed', err)
  try { daemon.kill('SIGTERM') } catch {}
  process.exit(1)
})
