import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { AgentConfigSchema, AgentSlugSchema, type AgentConfig } from '@openbot/protocol'
import type { HindsightClient } from '../memory/hindsight-client.js'
import { agentDir, ensureTeamFile, privateDir, writeTeam } from './store.js'

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  if (!s) return 'agent'
  try {
    return AgentSlugSchema.parse(s)
  } catch {
    return ('a' + s).slice(0, 48)
  }
}

function deriveName(description: string): string {
  const words = description.trim().split(/\s+/).slice(0, 3)
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Agent'
}

export async function createAgent(opts: {
  home: string
  name?: string
  description?: string
  harness?: 'claude-code' | 'codex'
}): Promise<
  | { ok: true; agent: AgentConfig }
  | { ok: false; error: 'invalid-name' | 'slug-taken' | 'need-name-or-description' }
> {
  if (!opts.name?.trim() && !opts.description?.trim()) {
    return { ok: false, error: 'need-name-or-description' }
  }
  const name = opts.name?.trim() || deriveName(opts.description!)
  let slug: string
  try {
    slug = slugify(name)
  } catch {
    return { ok: false, error: 'invalid-name' }
  }
  const team = await ensureTeamFile(opts.home)
  if (team.agents.some((a) => a.slug === slug)) return { ok: false, error: 'slug-taken' }

  const agent: AgentConfig = AgentConfigSchema.parse({
    id: randomUUID(),
    name,
    slug,
    harness: opts.harness ?? 'claude-code',
    model: opts.harness === 'codex' ? 'gpt-5.6-luna' : 'claude-sonnet-5',
    memoryBankId: randomUUID(),
    createdAt: new Date().toISOString(),
  })

  const dir = agentDir(opts.home, slug)
  const priv = privateDir(opts.home, slug)
  await fs.mkdir(path.join(dir, 'workspace'), { recursive: true })
  await fs.mkdir(priv, { recursive: true })
  const role = `# ${name}\n\n${opts.description?.trim() ?? ''}\n`
  await fs.writeFile(path.join(dir, 'role.md'), role, 'utf8')
  await fs.writeFile(path.join(dir, 'MEMORY.md'), '', 'utf8')
  await fs.writeFile(
    path.join(priv, 'sessions.json'),
    JSON.stringify({
      'claude-code': null,
      codex: null,
      lastInjectedSeq: { 'claude-code': 0, codex: 0 },
    }),
    'utf8',
  )
  team.agents.push(agent)
  await writeTeam(opts.home, team)
  return { ok: true, agent }
}

export async function deleteAgent(opts: {
  home: string
  agentId: string
  hindsight: HindsightClient | null
}): Promise<
  | { ok: true }
  | { ok: false; error: 'agent-not-found' | 'memory-delete-failed'; message?: string }
> {
  const team = await ensureTeamFile(opts.home)
  const agent = team.agents.find((a) => a.id === opts.agentId)
  if (!agent) return { ok: false, error: 'agent-not-found' }

  if (opts.hindsight) {
    const del = await opts.hindsight.deleteBank(agent.memoryBankId)
    if (!del.ok) {
      return { ok: false, error: 'memory-delete-failed', message: del.error }
    }
  }

  team.agents = team.agents.filter((a) => a.id !== opts.agentId)
  await writeTeam(opts.home, team)
  await fs.rm(agentDir(opts.home, agent.slug), { recursive: true, force: true })
  await fs.rm(privateDir(opts.home, agent.slug), { recursive: true, force: true })
  return { ok: true }
}

export async function renameAgent(opts: {
  home: string
  agentId: string
  name: string
}): Promise<
  | { ok: true; agent: AgentConfig }
  | { ok: false; error: 'agent-not-found' | 'invalid-name' }
> {
  const name = opts.name.trim()
  if (!name) return { ok: false, error: 'invalid-name' }
  const team = await ensureTeamFile(opts.home)
  const idx = team.agents.findIndex((a) => a.id === opts.agentId)
  if (idx < 0) return { ok: false, error: 'agent-not-found' }
  const prev = team.agents[idx]!
  const agent = AgentConfigSchema.parse({ ...prev, name })
  team.agents[idx] = agent
  await writeTeam(opts.home, team)
  const rolePath = path.join(agentDir(opts.home, agent.slug), 'role.md')
  let role = ''
  try {
    role = await fs.readFile(rolePath, 'utf8')
  } catch {
    role = ''
  }
  const lines = role.split('\n')
  if (lines[0]?.startsWith('#')) lines[0] = `# ${name}`
  else lines.unshift(`# ${name}`)
  await fs.writeFile(rolePath, lines.join('\n'), 'utf8')
  return { ok: true, agent }
}
