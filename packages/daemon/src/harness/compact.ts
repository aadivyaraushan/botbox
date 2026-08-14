import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process'
import readline from 'node:readline'
import { buildCodexExecArgv } from '../codex/exec-argv.js'

export function loadCompactPrompt(): string {
  const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'compact-prompt.md')
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return 'Summarize the prior conversation for the destination coding agent.'
  }
}

export async function runCodexCompact(opts: {
  spawnFn?: typeof defaultSpawn
  prompt: string
  cwd: string
  codexHome: string
  model?: string
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const spawnFn = opts.spawnFn ?? defaultSpawn
  const argv = buildCodexExecArgv({
    kind: 'compact',
    prompt: opts.prompt,
    model: opts.model ?? 'gpt-5.6-luna',
  })
  const child = spawnFn('codex', argv, {
    cwd: opts.cwd,
    env: { ...process.env, CODEX_HOME: opts.codexHome },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // Attach exit before reading stdout so a fast fake/real exit is not missed.
  const exitCode = new Promise<number>((resolve) => {
    if (child.exitCode != null) {
      resolve(child.exitCode)
      return
    }
    child.once('exit', (code) => resolve(code ?? 1))
  })
  let text = ''
  const rl = readline.createInterface({ input: child.stdout! })
  for await (const line of rl) {
    try {
      const ev = JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } }
      if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
        text += ev.item.text
      }
    } catch {
      /* */
    }
  }
  const code = await exitCode
  if (code !== 0 && !text) return { ok: false, error: `compact-exit-${code}` }
  return { ok: true, text: text || opts.prompt.slice(0, 2000) }
}

export type { ChildProcess }
