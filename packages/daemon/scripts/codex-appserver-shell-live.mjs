#!/usr/bin/env node
/**
 * Live Codex app-server shell probe on the shipped argv path.
 * Uses buildAppServerArgv + buildCodexConfigToml. Never passes --sandbox.
 *
 * CODEX_HOME=~/.openbot/codex-home \
 *   pnpm exec tsx packages/daemon/scripts/codex-appserver-shell-live.mjs
 *
 * Exit 0 when a commandExecution item with marker stdout is observed.
 *
 * Callers: manual evidence capture only (saved-results docs). Not imported by tests.
 * Does not replace packages/daemon/scripts/codex-builtin-shell-live.mjs (exec+sandbox; gated).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertSafeCodexArgv, buildAppServerArgv } from '../src/codex/exec-argv.ts'
import { buildCodexConfigToml } from '../src/codex/config.ts'

const MARKER = 'openbot-appserver-shell-ok'
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const authSrc = path.join(sharedCodex, 'auth.json')
const outDir =
  process.env.OPENBOT_APPSERVER_SHELL_OUT ??
  fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-appserver-shell-'))
const agentHome = path.join(outDir, 'codex-home')
const workspace = path.join(outDir, 'workspace')
const jsonlPath = path.join(outDir, 'out.jsonl')
const errPath = path.join(outDir, 'err.log')
const resultPath = path.join(outDir, 'result.json')

if (!fs.existsSync(authSrc)) {
  console.error('codex-appserver-shell-live: missing auth at', authSrc)
  process.exit(1)
}

fs.mkdirSync(agentHome, { recursive: true })
fs.mkdirSync(workspace, { recursive: true })
fs.copyFileSync(authSrc, path.join(agentHome, 'auth.json'))

const home = path.join(outDir, 'openbot-home')
fs.mkdirSync(home, { recursive: true })
const toml = buildCodexConfigToml({
  agentId: 'probe-shell',
  mcpToken: 'unused',
  mcpPort: 9,
  hindsightPort: 9,
  memoryBankId: 'unused-bank',
  home,
  otherAgentDirs: [],
})
if (/shell_tool\s*=\s*false/.test(toml)) {
  console.error('codex-appserver-shell-live: config must omit shell_tool=false')
  process.exit(2)
}
fs.writeFileSync(path.join(agentHome, 'config.toml'), toml, 'utf8')

const argv = buildAppServerArgv({ effort: 'low' })
assertSafeCodexArgv(argv)
if (argv.includes('--sandbox')) {
  console.error('codex-appserver-shell-live: forbidden --sandbox')
  process.exit(2)
}

const prompt =
  `Run exactly this shell command and nothing else: echo ${MARKER}. ` +
  `Do not ask questions. Reply with only the stdout.`

const child = spawn('codex', argv, {
  cwd: workspace,
  env: { ...process.env, CODEX_HOME: agentHome },
  stdio: ['pipe', 'pipe', 'pipe'],
})

const errChunks = []
child.stderr.on('data', (c) => errChunks.push(c))

let nextId = 1
const pending = new Map()
const send = (method, params) => {
  const id = nextId++
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
  })
}

const lines = []
let buf = ''
child.stdout.on('data', (chunk) => {
  buf += String(chunk)
  while (buf.includes('\n')) {
    const i = buf.indexOf('\n')
    const line = buf.slice(0, i)
    buf = buf.slice(i + 1)
    if (!line.trim()) continue
    lines.push(line)
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (typeof msg.id === 'number' && pending.has(msg.id) && ('result' in msg || 'error' in msg)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
      else p.resolve(msg.result)
    }
  }
})

const timeoutMs = Number(process.env.OPENBOT_APPSERVER_SHELL_TIMEOUT_MS ?? 120_000)
const timer = setTimeout(() => {
  try {
    child.kill('SIGTERM')
  } catch {
    /* ignore */
  }
}, timeoutMs)

try {
  await send('initialize', {
    clientInfo: { name: 'openbot-appserver-shell', version: '0' },
    capabilities: {},
  })
  const started = await send('thread/start', {
    model: process.env.OPENBOT_CODEX_MODEL ?? 'gpt-5.6-luna',
    cwd: workspace,
  })
  const threadId = started?.thread?.id
  if (!threadId) throw new Error('no thread id from thread/start')
  await send('turn/start', {
    threadId,
    input: [{ type: 'text', text: prompt }],
    model: process.env.OPENBOT_CODEX_MODEL ?? 'gpt-5.6-luna',
  })

  await new Promise((resolve, reject) => {
    const check = () => {
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (msg.method === 'turn/completed' || msg.method === 'turn/failed') {
            resolve(undefined)
            return true
          }
        } catch {
          /* ignore */
        }
      }
      return false
    }
    if (check()) return
    const iv = setInterval(() => {
      if (check()) clearInterval(iv)
    }, 200)
    child.on('close', () => {
      clearInterval(iv)
      resolve(undefined)
    })
    child.on('error', reject)
  })
} catch (err) {
  console.error('codex-appserver-shell-live: rpc failed', err)
} finally {
  clearTimeout(timer)
  try {
    child.stdin.end()
  } catch {
    /* ignore */
  }
}

const exitCode = await new Promise((resolve) => {
  if (child.exitCode != null) resolve(child.exitCode)
  else child.on('close', (code) => resolve(code ?? 1))
})

const jsonl = lines.join('\n') + (lines.length ? '\n' : '')
const errText = Buffer.concat(errChunks).toString('utf8')
fs.writeFileSync(jsonlPath, jsonl)
fs.writeFileSync(errPath, errText)

const executions = []
let turnCompleted = false
let turnFailed = false
for (const line of lines) {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    continue
  }
  if (msg.method === 'turn/completed') turnCompleted = true
  if (msg.method === 'turn/failed') turnFailed = true
  const item = msg.params?.item
  if (
    msg.method === 'item/completed' &&
    item &&
    (item.type === 'commandExecution' || item.type === 'command_execution')
  ) {
    executions.push({
      type: String(item.type),
      command: String(item.command ?? ''),
      aggregatedOutput: String(item.aggregatedOutput ?? item.aggregated_output ?? ''),
      exitCode: item.exitCode ?? item.exit_code ?? null,
      status: String(item.status ?? ''),
      raw: item,
    })
  }
}

const hit = executions.find(
  (e) =>
    e.command.includes(MARKER) &&
    e.aggregatedOutput.includes(MARKER) &&
    (e.exitCode === 0 || e.exitCode === null) &&
    (e.status === 'completed' || e.status === ''),
)

const result = {
  ok: Boolean(hit) && turnCompleted && !turnFailed,
  observedCommandExecution: Boolean(hit),
  itemType: hit?.type ?? null,
  command: hit?.command ?? null,
  stdout: hit?.aggregatedOutput ?? null,
  exitCode: hit?.exitCode ?? null,
  turnCompleted,
  turnFailed,
  processExitCode: exitCode,
  argv: ['codex', ...argv],
  configOmitsShellToolFalse: !/shell_tool\s*=\s*false/.test(toml),
  usedSandboxFlag: argv.includes('--sandbox'),
  executions,
  sharedCodexHome: sharedCodex,
  agentCodexHome: agentHome,
  jsonlPath,
  errPath,
  note: hit
    ? `Live app-server ${hit.type} observed (command + stdout) under buildAppServerArgv + permission profile`
    : 'No matching commandExecution with marker stdout on app-server path',
}

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 3)
