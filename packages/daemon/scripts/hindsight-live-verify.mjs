#!/usr/bin/env node
/**
 * Live Hindsight verify: spawn with remapped HOME, assert data_dir under hindsight/data,
 * retain + recall + MEMORY.md via Codex-backed LLM.
 *
 * CODEX_HOME=~/.openbot/codex-home OPENBOT_HINDSIGHT_ROOT=$PWD/resources/hindsight \
 *   node packages/daemon/scripts/hindsight-live-verify.mjs
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.execArgv.some((a) => a.includes('tsx'))) {
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env },
  )
  process.exit(r.status ?? 1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const resourcePath =
  process.env.OPENBOT_HINDSIGHT_ROOT ?? path.join(root, 'resources', 'hindsight')
const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.openbot', 'codex-home')
const evidenceDir = path.join(root, 'saved-results')
const evidencePath = path.join(evidenceDir, 'openbot-hindsight-live-verify-2026-08-15.md')

function fail(msg) {
  console.error(`[hindsight-live-verify] FAIL: ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(path.join(resourcePath, 'bin', 'hindsight-api'))) {
  fail(`missing hindsight-api under ${resourcePath}`)
}
if (!fs.existsSync(path.join(resourcePath, 'pg0-installation'))) {
  fail(`missing pg0-installation under ${resourcePath} (copy ~/.pg0/installation into bake)`)
}
if (!fs.existsSync(path.join(codexHome, 'auth.json'))) {
  fail(`missing Codex auth at ${codexHome}/auth.json`)
}

const openbotHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openbot-hs-live-'))
fs.mkdirSync(path.join(openbotHome, 'codex-home'), { recursive: true })
fs.copyFileSync(path.join(codexHome, 'auth.json'), path.join(openbotHome, 'codex-home', 'auth.json'))

const { spawnHindsight } = await import(
  pathToFileURL(path.join(root, 'packages/daemon/src/memory/hindsight-spawn.ts')).href
)
const { HindsightClient } = await import(
  pathToFileURL(path.join(root, 'packages/daemon/src/memory/hindsight-client.ts')).href
)
const { retainAndSnapshot } = await import(
  pathToFileURL(path.join(root, 'packages/daemon/src/memory/snapshot.ts')).href
)

const port = Number(process.env.OPENBOT_HINDSIGHT_PORT ?? 18993)
console.error(`[hindsight-live-verify] OPENBOT_HOME=${openbotHome}`)
console.error(`[hindsight-live-verify] resource=${resourcePath} port=${port}`)

const spawned = await spawnHindsight({
  home: openbotHome,
  port,
  resourcePath,
  llmProvider: 'openai-codex',
  llmModel: 'gpt-5.6-luna',
})
if (!spawned.ok) fail(`spawn failed: ${spawned.reason}`)

const child = spawned.child
const bound = spawned.port
const dataRoot = path.join(openbotHome, 'hindsight', 'data')
child.stderr?.on('data', (b) => process.stderr.write(String(b)))

async function waitReady(timeoutMs = 180_000) {
  const client = new HindsightClient({ baseUrl: `http://127.0.0.1:${bound}` })
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${bound}/docs`)
      if (res.ok || res.status === 200) return client
    } catch {
      /* retry */
    }
    if (child.exitCode !== null) fail(`hindsight exited early code=${child.exitCode}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  fail('timeout waiting for hindsight HTTP')
}

let client
try {
  client = await waitReady()

  const instanceJson = path.join(dataRoot, '.pg0', 'instances', 'hindsight', 'instance.json')
  const deadline = Date.now() + 60_000
  while (!fs.existsSync(instanceJson) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!fs.existsSync(instanceJson)) fail(`missing instance.json under ${dataRoot}`)
  const instance = JSON.parse(fs.readFileSync(instanceJson, 'utf8'))
  const dataDir = String(instance.data_dir ?? '')
  console.error(`[hindsight-live-verify] data_dir=${dataDir}`)
  if (!dataDir.startsWith(dataRoot + path.sep) && dataDir !== dataRoot) {
    fail(`data_dir outside hindsight/data: ${dataDir} (expected under ${dataRoot})`)
  }
  const realHomePg0 = path.join(os.homedir(), '.pg0')
  if (dataDir === realHomePg0 || dataDir.startsWith(realHomePg0 + path.sep)) {
    fail(`data_dir escaped to ${realHomePg0}`)
  }

  const bankId = randomUUID()
  const agentDir = path.join(openbotHome, 'agents', 'verify-ada')
  fs.mkdirSync(agentDir, { recursive: true })
  const marker = `OpenBot live verify marker ${bankId.slice(0, 8)} prefers blue notebooks.`
  const turn = {
    id: randomUUID(),
    agentId: 'verify',
    status: 'finished',
    parts: [{ type: 'text', text: marker }],
  }
  const snap = await retainAndSnapshot({
    client,
    bankId,
    agentId: 'verify',
    agentDir,
    turn,
  })
  if (!snap.ok) fail('retainAndSnapshot failed')
  const memoryPath = path.join(agentDir, 'MEMORY.md')
  if (!fs.existsSync(memoryPath)) fail('MEMORY.md not written')
  const memoryBody = fs.readFileSync(memoryPath, 'utf8')
  if (!memoryBody.trim()) fail('MEMORY.md empty after recall')

  const recall = await client.recall(bankId, 'blue notebooks', 1024)
  if (!recall.ok) fail(`recall failed: ${recall.error}`)
  const joined = recall.results.map((r) => r.text).join('\n')
  console.error(`[hindsight-live-verify] recall hits=${recall.results.length}`)

  fs.mkdirSync(evidenceDir, { recursive: true })
  const body = `# OpenBot Hindsight live verify

**Date:** 2026-08-15
**For:** pass-4 p4-hindsight acceptance (G1–G3)

## Result

- Spawn OK on port ${bound}
- \`data_dir\` under data root: \`${dataDir}\`
- Retain+snapshot OK; MEMORY.md bytes=${memoryBody.length}
- Recall OK; results=${recall.results.length}

## Inputs

- OPENBOT_HOME (temp): \`${openbotHome}\`
- OPENBOT_HINDSIGHT_ROOT: \`${resourcePath}\`
- CODEX_HOME (auth source): \`${codexHome}\`
- bankId: \`${bankId}\`
- marker: \`${marker}\`

## Reproduce

\`\`\`bash
cd ${root}
CODEX_HOME=~/.openbot/codex-home OPENBOT_HINDSIGHT_ROOT=$PWD/resources/hindsight \\
  node packages/daemon/scripts/hindsight-live-verify.mjs
\`\`\`

## MEMORY.md (clipped)

\`\`\`
${memoryBody.slice(0, 2000)}
\`\`\`

## Recall sample

\`\`\`
${joined.slice(0, 1500)}
\`\`\`
`
  fs.writeFileSync(evidencePath, body)
  console.error(`[hindsight-live-verify] PASS evidence=${evidencePath}`)
} finally {
  child.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 1500))
  try {
    child.kill('SIGKILL')
  } catch {
    /* gone */
  }
  process.exit(0)
}
