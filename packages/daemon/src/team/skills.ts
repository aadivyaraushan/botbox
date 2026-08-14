import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AgentConfig } from '@openbot/protocol'

const SKIP = new Set([
  'model', 'effort', 'reasoning', 'compact', 'status', 'usage', 'context', 'mcp', 'init', 'fast', 'clear',
])

async function readSkillsDir(dir: string): Promise<Array<{ name: string; body: string }>> {
  const out: Array<{ name: string; body: string }> = []
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue
    const skillPath = path.join(dir, name, 'SKILL.md')
    try {
      const body = await fs.readFile(skillPath, 'utf8')
      out.push({ name, body })
    } catch {
      /* skip */
    }
  }
  return out
}

export async function listSkills(
  agent: AgentConfig,
  home: string = os.homedir(),
): Promise<Array<{ name: string; body: string }>> {
  const seen = new Set<string>()
  const result: Array<{ name: string; body: string }> = []
  const dirs: string[] = []
  if (agent.harness === 'claude-code') {
    dirs.push(
      path.join(home, 'agents', agent.slug, 'workspace', '.claude', 'skills'),
      path.join(os.homedir(), '.claude', 'skills'),
    )
  } else {
    dirs.push(
      path.join(home, 'agents', agent.slug, 'workspace', '.codex', 'skills'),
      path.join(os.homedir(), '.codex', 'skills'),
    )
  }
  for (const dir of dirs) {
    for (const s of await readSkillsDir(dir)) {
      if (seen.has(s.name) || SKIP.has(s.name)) continue
      seen.add(s.name)
      result.push(s)
    }
  }
  return result
}
