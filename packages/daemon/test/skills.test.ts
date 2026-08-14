import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { connect, request, startTestDaemon } from './helpers.js'

describe('agent.skills', () => {
  it('first-wins, skips built-ins, empty when missing', async () => {
    const { daemon, home, adminToken, port } = await startTestDaemon()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agentId = (created as { agent: { id: string; slug: string } }).agent.id
    const slug = (created as { agent: { slug: string } }).agent.slug

    // When workspace skills dir is missing, ok:true (may still list global ~/.claude/skills)
    const before = await request(ws, { type: 'agent.skills', agentId })
    expect(before.ok).toBe(true)
    expect(Array.isArray((before as { skills: unknown[] }).skills)).toBe(true)

    const skillDir = path.join(home, 'agents', slug, 'workspace', '.claude', 'skills', 'draft')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), 'Draft it.', 'utf8')
    await fs.mkdir(path.join(home, 'agents', slug, 'workspace', '.claude', 'skills', 'model'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(home, 'agents', slug, 'workspace', '.claude', 'skills', 'model', 'SKILL.md'),
      'skip',
      'utf8',
    )
    await fs.mkdir(path.join(home, 'agents', slug, 'workspace', '.claude', 'skills', 'compact'), {
      recursive: true,
    })
    await fs.writeFile(
      path.join(home, 'agents', slug, 'workspace', '.claude', 'skills', 'compact', 'SKILL.md'),
      'skip',
      'utf8',
    )

    const skills = await request(ws, { type: 'agent.skills', agentId })
    expect(skills.ok).toBe(true)
    const names = (skills as { skills: Array<{ name: string; body: string }> }).skills.map((s) => s.name)
    expect(names[0]).toBe('draft')
    expect(names).not.toContain('model')
    expect(names).not.toContain('compact')
    expect(
      (skills as { skills: Array<{ name: string; body: string }> }).skills.find((s) => s.name === 'draft')
        ?.body,
    ).toBe('Draft it.')

    // missing workspace dirs alone still returns ok:true skills array
    await fs.rm(path.join(home, 'agents', slug, 'workspace', '.claude'), { recursive: true, force: true })
    const after = await request(ws, { type: 'agent.skills', agentId })
    expect(after).toMatchObject({ ok: true })
    expect(Array.isArray((after as { skills: unknown[] }).skills)).toBe(true)

    await daemon.stop()
    ws.close()
  })
})
