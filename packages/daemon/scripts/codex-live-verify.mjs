#!/usr/bin/env node
/**
 * Codex live harness verify against a real daemon.
 * Requires auth at $CODEX_HOME/auth.json (default ~/.openbot/codex-home).
 * Daemon uses $OPENBOT_HOME/codex-home (copies auth when paths differ).
 *
 * Callers: gap-codex-surface (`node packages/daemon/scripts/codex-live-verify.mjs`).
 * Result JSON: { ok, agentId, harness, turnFinished, askSeen, files, ... }
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const port = Number(process.env.OPENBOT_PORT ?? 18846)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const home = process.env.OPENBOT_HOME ?? path.join(os.homedir(), '.openbot')
const authSrc = path.join(sharedCodex, 'auth.json')
const authDest = path.join(home, 'codex-home', 'auth.json')

if (!fs.existsSync(authSrc)) {
  console.error('codex-live-verify: missing auth at', authSrc)
  process.exit(1)
}
fs.mkdirSync(path.dirname(authDest), { recursive: true })
if (path.resolve(authSrc) !== path.resolve(authDest)) {
  fs.copyFileSync(authSrc, authDest)
}

const tsx = path.join(root, 'node_modules/.bin/tsx')
const daemon = spawn(tsx, [path.join(root, 'packages/app/scripts/start-real-daemon.mjs')], {
  cwd: path.join(root, 'packages/daemon'),
  env: {
    ...process.env,
    OPENBOT_HOME: home,
    OPENBOT_ADMIN_TOKEN: token,
    OPENBOT_PORT: String(port),
    CODEX_HOME: path.join(home, 'codex-home'),
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

function request(ws, body, timeoutMs = 120_000) {
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

async function main() {
  await waitListening()
  const ws = await connect()
  const events = []
  ws.on('message', (raw) => {
    try {
      events.push(JSON.parse(String(raw)))
    } catch {
      /* ignore */
    }
  })

  await request(ws, { type: 'event.stream' })

  const name = `CodexLive${Date.now() % 100000}`
  const created = await request(ws, { type: 'agent.create', name })
  if (!created.ok) throw new Error('agent.create failed ' + JSON.stringify(created))
  const agentId = created.agent.id
  const slug = created.agent.slug

  const harness = await request(ws, { type: 'agent.setHarness', agentId, harness: 'codex' })
  if (!harness.ok) throw new Error('agent.setHarness codex failed ' + JSON.stringify(harness))

  const got = await request(ws, { type: 'agent.get', agentId })
  if (!got.ok || got.agent?.harness !== 'codex') {
    throw new Error('agent not on codex: ' + JSON.stringify(got))
  }

  const turnPrompt =
    'Reply with exactly one short sentence that includes the word OPENBOT_CODEX_LIVE. Do not ask questions.'
  const sent = await request(ws, { type: 'chat.send', agentId, text: turnPrompt })
  if (!sent.ok) throw new Error('chat.send failed ' + JSON.stringify(sent))

  const turnDeadline = Date.now() + 180_000
  let turnFinished = false
  let assistantText = ''
  while (Date.now() < turnDeadline) {
    for (const e of events) {
      const ev = e.event
      if (e.channel === 'harness' && ev?.kind === 'assistant-text') {
        assistantText += String(ev.delta ?? '')
      }
      if (e.channel === 'harness' && ev?.kind === 'turn-finished') turnFinished = true
    }
    if (turnFinished && /OPENBOT_CODEX_LIVE/i.test(assistantText)) break
    if (turnFinished) break
    await sleep(300)
  }

  const askPrompt =
    'Ask me one question using request_user_input / AskUserQuestion: "Ship today or tomorrow?" with options "Today" and "Tomorrow". Do not answer in prose. Call the tool.'
  const askSent = await request(ws, { type: 'chat.send', agentId, text: askPrompt })
  let askSeen = false
  let askPartId = null
  let askError = null
  if (askSent.ok) {
    const askDeadline = Date.now() + 120_000
    while (Date.now() < askDeadline) {
      for (const e of events) {
        const ev = e.event
        if (e.channel === 'harness' && ev?.kind === 'ask-user-question') {
          askSeen = true
          askPartId = ev.partId
          break
        }
      }
      if (askSeen) break
      await sleep(300)
    }
    if (askSeen && askPartId) {
      const ans = await request(ws, {
        type: 'ask.answer',
        agentId,
        partId: askPartId,
        answers: { 'Ship today or tomorrow?': 'Today' },
      })
      if (!ans.ok) askError = JSON.stringify(ans)
    } else {
      askError = 'no ask-user-question within 120s (app-server may not have emitted requestUserInput)'
      await request(ws, { type: 'chat.stop', agentId }).catch(() => {})
    }
  } else {
    askError = 'ask chat.send failed: ' + JSON.stringify(askSent)
  }

  const files = await request(ws, { type: 'agent.files', agentId })
  const fileList = files.ok ? files.files : []
  const readRole = await request(ws, { type: 'agent.readFile', agentId, path: 'role.md' })

  const result = {
    ok: Boolean(turnFinished && /OPENBOT_CODEX_LIVE/i.test(assistantText)),
    agentId,
    slug,
    harness: 'codex',
    turnFinished,
    assistantSnippet: assistantText.slice(0, 400),
    askSeen,
    askPartId,
    askError,
    files: fileList,
    rolePreview: readRole.ok ? String(readRole.text ?? '').slice(0, 200) : readRole,
    browserNote:
      'Agent browser/terminal MCP exercised only when Codex calls tools; UI panes covered by m5-real-surface.mjs',
    home,
    port,
    auth: authDest,
  }
  console.log(JSON.stringify(result, null, 2))
  ws.close()
  daemon.kill('SIGTERM')
  process.exit(result.ok ? 0 : 1)
}

main().catch(async (err) => {
  console.error('codex-live-verify failed', err)
  try {
    daemon.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
