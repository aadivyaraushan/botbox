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

function installationHasVersion(dir: string): boolean {
  if (!fs.existsSync(dir)) return false
  try {
    return fs.readdirSync(dir).some((name) => {
      const full = path.join(dir, name)
      try {
        return fs.statSync(full).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/** Copy bundled PostgreSQL binaries into the remapped HOME/.pg0/installation. */
export function seedPg0Installation(resourceRoot: string, dataRoot: string): boolean {
  const src = path.join(resourceRoot, 'pg0-installation')
  const dest = path.join(dataRoot, '.pg0', 'installation')
  if (!installationHasVersion(src)) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (!installationHasVersion(dest)) {
    fs.cpSync(src, dest, { recursive: true })
  }
  return installationHasVersion(dest)
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

  if (!seedPg0Installation(root, dataRoot)) {
    console.error('[memory] hindsight-pg-missing')
    return { ok: false, reason: 'missing', port: args.port }
  }

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
    HOME: dataRoot,
    HF_HOME: hfHome,
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
    HINDSIGHT_API_HOST: '127.0.0.1',
    HINDSIGHT_API_PORT: String(port),
    HINDSIGHT_API_LLM_PROVIDER: provider,
    HINDSIGHT_API_LLM_MODEL: model,
    HINDSIGHT_API_EMBEDDINGS_PROVIDER: 'local',
    HINDSIGHT_API_DATABASE_URL: 'pg0://hindsight',
    CLAUDE_CONFIG_DIR: path.join(args.home, 'claude-config'),
    CODEX_HOME: path.join(args.home, 'codex-home'),
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
