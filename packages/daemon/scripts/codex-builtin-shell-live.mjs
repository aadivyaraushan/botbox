#!/usr/bin/env node
/**
 * Observe a real Codex built-in command_execution turn (command + stdout).
 * Not config-only restoredBuiltinOk. Default config must omit shell_tool=false.
 *
 * CODEX_HOME=~/.openbot/codex-home \
 *   node packages/daemon/scripts/codex-builtin-shell-live.mjs
 *
 * Exit 0 when command_execution ran echo openbot-builtin-shell-ok and stdout matched.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MARKER = 'openbot-builtin-shell-ok'
const sharedCodex =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const authSrc = path.join(sharedCodex, 'auth.json')
const outDir =
  process.env.OPENBOT_BUILTIN_SHELL_OUT ??
  fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-builtin-shell-'))
const agentHome = path.join(outDir, 'codex-home')
const jsonlPath = path.join(outDir, 'out.jsonl')
const errPath = path.join(outDir, 'err.log')
const resultPath = path.join(outDir, 'result.json')

if (!fs.existsSync(authSrc)) {
  console.error('codex-builtin-shell-live: missing auth at', authSrc)
  process.exit(1)
}

fs.mkdirSync(agentHome, { recursive: true })
fs.copyFileSync(authSrc, path.join(agentHome, 'auth.json'))
fs.writeFileSync(
  path.join(agentHome, 'config.toml'),
  [
    'approval_policy = "never"',
    'sandbox_mode = "danger-full-access"',
    'suppress_unstable_features_warning = true',
    '',
    '[features]',
    'default_mode_request_user_input = true',
    '',
  ].join('\n'),
  'utf8',
)

const configToml = fs.readFileSync(path.join(agentHome, 'config.toml'), 'utf8')
const shellToolFalse = /shell_tool\s*=\s*false/.test(configToml)
if (shellToolFalse) {
  console.error('codex-builtin-shell-live: config must omit shell_tool=false')
  process.exit(2)
}

const prompt =
  `Run exactly this shell command and nothing else: echo ${MARKER}. ` +
  `Do not ask questions. Reply with only the stdout.`

const argv = [
  'exec',
  prompt,
  '--json',
  '--sandbox',
  'danger-full-access',
  '--skip-git-repo-check',
  '--dangerously-bypass-hook-trust',
  '--model',
  process.env.OPENBOT_CODEX_MODEL ?? 'gpt-5.6-luna',
  '-c',
  'model_reasoning_effort=low',
]

const child = spawn('codex', argv, {
  env: { ...process.env, CODEX_HOME: agentHome },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const outChunks = []
const errChunks = []
child.stdout.on('data', (c) => outChunks.push(c))
child.stderr.on('data', (c) => errChunks.push(c))

const exitCode = await new Promise((resolve) => {
  child.on('close', (code) => resolve(code ?? 1))
})

const jsonl = Buffer.concat(outChunks).toString('utf8')
const errText = Buffer.concat(errChunks).toString('utf8')
fs.writeFileSync(jsonlPath, jsonl)
fs.writeFileSync(errPath, errText)

/** @type {Array<{command:string,aggregated_output:string,exit_code:number|null,status:string}>} */
const executions = []
let turnCompleted = false
let turnFailed = false
for (const line of jsonl.split('\n')) {
  if (!line.trim()) continue
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    continue
  }
  if (msg.type === 'turn.completed') turnCompleted = true
  if (msg.type === 'turn.failed') turnFailed = true
  const item = msg.item
  if (
    msg.type === 'item.completed' &&
    item &&
    (item.type === 'command_execution' || item.type === 'commandExecution')
  ) {
    executions.push({
      command: String(item.command ?? ''),
      aggregated_output: String(item.aggregated_output ?? item.aggregatedOutput ?? ''),
      exit_code: item.exit_code ?? item.exitCode ?? null,
      status: String(item.status ?? ''),
    })
  }
}

const hit = executions.find(
  (e) =>
    e.command.includes(MARKER) &&
    e.aggregated_output.includes(MARKER) &&
    (e.exit_code === 0 || e.exit_code === null) &&
    (e.status === 'completed' || e.status === ''),
)

const result = {
  ok: Boolean(hit) && turnCompleted && !turnFailed && exitCode === 0 && !shellToolFalse,
  observedCommandExecution: Boolean(hit),
  command: hit?.command ?? null,
  stdout: hit?.aggregated_output ?? null,
  exitCode: hit?.exit_code ?? null,
  turnCompleted,
  turnFailed,
  processExitCode: exitCode,
  shellToolFalse,
  configOmitsShellToolFalse: !shellToolFalse,
  executions,
  sharedCodexHome: sharedCodex,
  agentCodexHome: agentHome,
  jsonlPath,
  errPath,
  note: hit
    ? 'Live built-in command_execution observed (command + stdout)'
    : 'No matching command_execution with marker stdout',
}

fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
process.exit(result.ok ? 0 : 3)
