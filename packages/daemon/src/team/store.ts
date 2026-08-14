import fs from 'node:fs/promises'
import path from 'node:path'
import { AgentConfigSchema, type AgentConfig } from '@openbot/protocol'

export type TeamFile = { agents: AgentConfig[] }

export async function ensureTeamFile(home: string): Promise<TeamFile> {
  const p = path.join(home, 'team.json')
  try {
    const raw = await fs.readFile(p, 'utf8')
    const parsed = JSON.parse(raw) as TeamFile
    if (!parsed.agents) parsed.agents = []
    return parsed
  } catch {
    const empty: TeamFile = { agents: [] }
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(empty, null, 2), 'utf8')
    return empty
  }
}

export async function writeTeam(home: string, team: TeamFile): Promise<void> {
  const p = path.join(home, 'team.json')
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, JSON.stringify(team, null, 2), 'utf8')
}

export async function setFast(
  home: string,
  agentId: string,
  fast: boolean,
): Promise<{ ok: true; agent: AgentConfig } | { ok: false; error: 'agent-not-found' }> {
  const team = await ensureTeamFile(home)
  const idx = team.agents.findIndex((a) => a.id === agentId)
  if (idx < 0) return { ok: false, error: 'agent-not-found' }
  const agent = { ...team.agents[idx]!, fast }
  team.agents[idx] = AgentConfigSchema.parse(agent)
  await writeTeam(home, team)
  return { ok: true, agent: team.agents[idx]! }
}

export function agentDir(home: string, slug: string): string {
  return path.join(home, 'agents', slug)
}

export function privateDir(home: string, slug: string): string {
  return path.join(home, 'private', slug)
}
