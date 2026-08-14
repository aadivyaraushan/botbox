import fs from 'node:fs/promises'
import path from 'node:path'
import type { AgentConfig } from '@openbot/protocol'
import { agentDir, privateDir } from './store.js'

const SKIP_DIRS = new Set(['node_modules', '.git'])
const SKIP_FILES = new Set(['browser-history.jsonl'])

async function walkWorkspace(root: string, relBase: string): Promise<string[]> {
  const out: string[] = []
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      const nested = await walkWorkspace(path.join(root, entry.name), path.join(relBase, entry.name))
      out.push(...nested)
      continue
    }
    if (SKIP_FILES.has(entry.name)) continue
    out.push(path.join(relBase, entry.name).split(path.sep).join('/'))
  }
  return out
}

export async function listAgentFiles(home: string, agent: AgentConfig): Promise<string[]> {
  const dir = agentDir(home, agent.slug)
  const files: string[] = []
  for (const name of ['role.md', 'MEMORY.md'] as const) {
    try {
      const st = await fs.stat(path.join(dir, name))
      if (st.isFile()) files.push(name)
    } catch {
      /* skip missing */
    }
  }
  const workspace = await walkWorkspace(path.join(dir, 'workspace'), 'workspace')
  workspace.sort((a, b) => a.localeCompare(b))
  files.push(...workspace)
  return files
}

export async function readAgentFile(
  home: string,
  agent: AgentConfig,
  relPath: string,
): Promise<
  | { ok: true; text: string }
  | { ok: false; error: 'not-found' | 'forbidden' }
> {
  if (!relPath || relPath.includes('\0')) return { ok: false, error: 'forbidden' }
  const normalized = relPath.replace(/\\/g, '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
    return { ok: false, error: 'forbidden' }
  }

  const dir = agentDir(home, agent.slug)
  const resolved = path.resolve(dir, normalized)
  const rootResolved = path.resolve(dir)
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    return { ok: false, error: 'forbidden' }
  }

  const priv = path.resolve(privateDir(home, agent.slug))
  if (resolved === priv || resolved.startsWith(priv + path.sep)) {
    return { ok: false, error: 'forbidden' }
  }
  const privateRoot = path.resolve(home, 'private')
  if (resolved === privateRoot || resolved.startsWith(privateRoot + path.sep)) {
    return { ok: false, error: 'forbidden' }
  }

  try {
    const st = await fs.stat(resolved)
    if (!st.isFile()) return { ok: false, error: 'not-found' }
    const text = await fs.readFile(resolved, 'utf8')
    return { ok: true, text }
  } catch {
    return { ok: false, error: 'not-found' }
  }
}
