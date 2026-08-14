import type { ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { spawn as defaultSpawn } from 'node:child_process'

export type SpawnHindsightArgs = {
  spawnFn?: typeof defaultSpawn
  home: string
  port: number
  resourcePath?: string
  llmProvider?: 'claude-code' | 'openai-codex'
  llmModel?: string
}

export type SpawnHindsightResult =
  | { ok: true; child: ChildProcess; port: number }
  | { ok: false; reason: 'missing' | 'port-busy'; port: number }

async function portFree(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '127.0.0.1', () => {
      s.close(() => resolve(true))
    })
  })
}

export async function spawnHindsight(args: SpawnHindsightArgs): Promise<SpawnHindsightResult> {
  const spawnFn = args.spawnFn ?? defaultSpawn
  const root = args.resourcePath ?? path.join(args.home, 'hindsight')
  const entry = path.join(root, 'bin', 'hindsight-api')
  if (!fs.existsSync(entry)) {
    console.error('[memory] hindsight-missing')
    return { ok: false, reason: 'missing', port: args.port }
  }

  const dataRoot = path.join(args.home, 'hindsight', 'data')
  fs.mkdirSync(dataRoot, { recursive: true })

  let port = args.port
  if (!(await portFree(port))) {
    const next = port + 1
    if (!(await portFree(next))) {
      console.error('[memory] hindsight-port-busy')
      return { ok: false, reason: 'port-busy', port }
    }
    port = next
  }

  const provider = args.llmProvider ?? 'openai-codex'
  const model =
    args.llmModel ?? (provider === 'claude-code' ? 'claude-sonnet-5' : 'gpt-5.6-luna')
  const hfHome = path.join(root, 'hf-cache')
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HF_HOME: hfHome,
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
    HINDSIGHT_API_HOST: '127.0.0.1',
    HINDSIGHT_API_PORT: String(port),
    HINDSIGHT_API_LLM_PROVIDER: provider,
    HINDSIGHT_API_LLM_MODEL: model,
    HINDSIGHT_API_EMBEDDINGS_PROVIDER: 'local',
    CLAUDE_CONFIG_DIR: path.join(args.home, 'claude-config'),
    CODEX_HOME: path.join(args.home, 'hindsight', 'codex'),
  }

  const child = spawnFn(entry, ['--host', '127.0.0.1', '--port', String(port)], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return { ok: true, child, port }
}

export function resolveLlmProvider(home: string): 'claude-code' | 'openai-codex' {
  const creds = path.join(home, 'claude-config', '.credentials.json')
  return fs.existsSync(creds) ? 'claude-code' : 'openai-codex'
}
