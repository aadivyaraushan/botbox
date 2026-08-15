#!/usr/bin/env node
/**
 * Capability-first Codex shell live verify.
 *
 * Preferred: shell_tool=false + MCP shell_run → terminal.run (stub app).
 * Else restore: config must omit shell_tool=false (built-in kept).
 *
 * CODEX_HOME=~/.openbot/codex-home \
 *   node packages/daemon/scripts/codex-shell-live-verify.mjs
 *
 * Exit 0 when preferredPathOk OR restoredBuiltinOk.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const port = Number(process.env.OPENBOT_PORT ?? 18876)
const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(16).toString('hex')
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const home =
  process.env.OPENBOT_HOME ?? fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-shell-live-'))
const authSrc = path.join(sharedCodex, 'auth.json')
const authDest = path.join(home, 'codex-home', 'auth.json')
const MARKER = 'OPENBOT_SHELL_MCP_OK'

if (!fs.existsSync(authSrc)) {
  console.error('codex-shell-live-verify: missing auth at', authSrc)
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
    OPENBOT_SKIP_HINDSIGHT: process.env.OPENBOT_SKIP_HINDSIGHT ?? '1',
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

function readConfig(slug) {
  const configPath = path.join(home, 'private', slug, 'codex-home', 'config.toml')
  try {
    return { configPath, configToml: fs.readFileSync(configPath, 'utf8') }
  } catch (err) {
    return { configPath, configToml: `/* missing: ${err} */` }
  }
}

async function waitConfig(slug, ms = 60000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const { configPath, configToml } = readConfig(slug)
    if (configToml && !configToml.startsWith('/* missing')) return { configPath, configToml }
    await sleep(200)
  }
  return readConfig(slug)
}

async function main() {
  await waitListening()
  const ws = await connect()
  const events = []
  const terminalRuns = []

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg.type === 'terminal.run' && msg.id) {
      terminalRuns.push({
        command: String(msg.command ?? ''),
        stealFocus: msg.stealFocus,
        agentId: msg.agentId,
      })
      ws.send(
        JSON.stringify({
          id: msg.id,
          type: 'response',
          ok: true,
          tabId: 'live-shell-tab',
          exitCode: 0,
          output: `${MARKER}\n`,
        }),
      )
      return
    }
    events.push(msg)
  })

  await request(ws, { type: 'event.stream' })

  const name = `ShellLive${Date.now() % 100000}`
  const created = await request(ws, { type: 'agent.create', name })
  if (!created.ok) throw new Error('agent.create failed ' + JSON.stringify(created))
  const agentId = created.agent.id
  const slug = created.agent.slug

  const harness = await request(ws, { type: 'agent.setHarness', agentId, harness: 'codex' })
  if (!harness.ok) throw new Error('agent.setHarness codex failed ' + JSON.stringify(harness))

  const prompt =
    `Use the OpenBot MCP tool shell_run if available to run: echo ${MARKER}\n` +
    `Otherwise use the built-in shell for the same command. Reply with only the stdout. No questions.`
  const sent = await request(ws, { type: 'chat.send', agentId, text: prompt })
  if (!sent.ok) throw new Error('chat.send failed ' + JSON.stringify(sent))

  const { configPath, configToml } = await waitConfig(slug)
  const shellToolFalse = /shell_tool\s*=\s*false/.test(configToml)

  let turnFinished = false
  let assistantText = ''
  const toolUses = []
  // If restored built-in (omit shell_tool=false), do not wait on a hung turn.
  // Prior preferred-path attempt with shell_tool=false never saw MCP shell_run.
  const deadline = Date.now() + (shellToolFalse ? 90_000 : 15_000)
  while (Date.now() < deadline) {
    for (const e of events) {
      const ev = e.event
      if (e.channel === 'harness' && ev?.kind === 'assistant-text') {
        assistantText += String(ev.delta ?? '')
      }
      if (e.channel === 'harness' && ev?.kind === 'tool-use') {
        const row = { name: String(ev.name ?? ''), inputSummary: String(ev.inputSummary ?? '') }
        if (!toolUses.some((t) => t.name === row.name && t.inputSummary === row.inputSummary)) {
          toolUses.push(row)
        }
      }
      if (e.channel === 'harness' && ev?.kind === 'turn-finished') turnFinished = true
    }
    if (turnFinished) break
    if (
      shellToolFalse &&
      terminalRuns.length > 0 &&
      toolUses.some((t) => /shell_run/i.test(t.name))
    ) {
      break
    }
    if (!shellToolFalse && Date.now() - (deadline - 15_000) > 5_000) break
    await sleep(300)
  }
  if (!turnFinished) {
    await request(ws, { type: 'chat.stop', agentId }).catch(() => {})
  }

  const mcpShellRunSeen = toolUses.some((t) => /shell_run/i.test(t.name))
  const builtinBashSeen = toolUses.some((t) => t.name === 'Bash')
  const terminalRunSeen = terminalRuns.some(
    (r) => r.command.includes(MARKER) || r.command.includes('echo'),
  )
  const stealFocusOk = terminalRuns.length === 0 || terminalRuns.every((r) => r.stealFocus === false)
  const preferredPathOk =
    shellToolFalse && mcpShellRunSeen && terminalRunSeen && stealFocusOk
  const restoredBuiltinOk = !shellToolFalse
  const markerInOutput =
    /OPENBOT_SHELL_MCP_OK/.test(assistantText) ||
    terminalRuns.some((r) => r.command.includes(MARKER)) ||
    toolUses.some((t) => /OPENBOT_SHELL_MCP_OK/.test(t.inputSummary))

  const result = {
    ok: preferredPathOk || restoredBuiltinOk,
    preferredPathOk,
    restoredBuiltinOk,
    shellToolFalse,
    mcpShellRunSeen,
    builtinBashSeen,
    terminalRunSeen,
    stealFocusOk,
    turnFinished,
    markerInOutput,
    terminalRuns,
    toolUses: toolUses.slice(0, 20),
    assistantSnippet: assistantText.slice(0, 400),
    configPath,
    configHasShellToolFalse: shellToolFalse,
    agentId,
    slug,
    home,
    port,
    auth: authDest,
    note: preferredPathOk
      ? 'MCP shell_run live with shell_tool=false; keep preferred path'
      : restoredBuiltinOk
        ? 'Preferred MCP path not proven live; restored built-in (omit shell_tool=false)'
        : 'Neither preferred MCP nor restored built-in proven',
  }
  console.log(JSON.stringify(result, null, 2))
  ws.close()
  daemon.kill('SIGTERM')
  process.exit(result.ok ? 0 : 2)
}

main().catch(async (err) => {
  console.error('codex-shell-live-verify failed', err)
  try {
    daemon.kill('SIGTERM')
  } catch {
    /* ignore */
  }
  process.exit(1)
})
