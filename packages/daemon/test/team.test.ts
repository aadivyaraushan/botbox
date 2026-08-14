import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { connect, request, startTestDaemon, type FakeMemory } from './helpers.js'

describe('team', () => {
  it('create appends memoryBankId; description-only; list/get banners; rename; setFast; delete 404/non-404', async () => {
    const mem: FakeMemory = { banks: new Map(), calls: [], failDelete: false }
    const { daemon, home, adminToken, port, mem: m } = await startTestDaemon({ mem })
    const ws = await connect(port, adminToken)

    const teamPath = path.join(home, 'team.json')
    const raw = JSON.parse(await fs.readFile(teamPath, 'utf8'))
    expect(raw).toEqual({ agents: [] })

    const byDesc = await request(ws, { type: 'agent.create', description: 'writes docs carefully' })
    expect(byDesc.ok).toBe(true)
    const a1 = (byDesc as { agent: { name: string; slug: string; memoryBankId: string; id: string } }).agent
    expect(a1.memoryBankId).toBeTruthy()
    expect(a1.name.length).toBeGreaterThan(0)

    const list = await request(ws, { type: 'agent.list' })
    expect(list.ok).toBe(true)
    const entry = (list as { agents: Array<{ banners: unknown; runtime: unknown; agent: unknown }> }).agents[0]!
    expect(entry.banners).toEqual([])
    expect(entry.runtime).toBeTruthy()

    const get = await request(ws, { type: 'agent.get', agentId: a1.id })
    expect(get).toMatchObject({ ok: true })
    expect((get as { banners: unknown[] }).banners).toEqual([])

    const renamed = await request(ws, { type: 'agent.rename', agentId: a1.id, name: 'Ada Docs' })
    expect(renamed.ok).toBe(true)
    expect((renamed as { agent: { name: string; slug: string; memoryBankId: string } }).agent.slug).toBe(
      a1.slug,
    )
    expect((renamed as { agent: { memoryBankId: string } }).agent.memoryBankId).toBe(a1.memoryBankId)
    const role = await fs.readFile(path.join(home, 'agents', a1.slug, 'role.md'), 'utf8')
    expect(role.startsWith('# Ada Docs')).toBe(true)

    const fast = await request(ws, { type: 'agent.setFast', agentId: a1.id, fast: true })
    expect(fast.ok).toBe(true)
    expect((fast as { agent: { fast?: boolean } }).agent.fast).toBe(true)

    // DELETE 404 still deletes
    m.banks.clear()
    const del = await request(ws, { type: 'agent.delete', agentId: a1.id })
    expect(del.ok).toBe(true)
    await expect(fs.access(path.join(home, 'agents', a1.slug))).rejects.toThrow()

    // recreate then non-404 abort
    const again = await request(ws, { type: 'agent.create', name: 'Ada' })
    const a2 = (again as { agent: { id: string; slug: string; memoryBankId: string } }).agent
    m.banks.set(a2.memoryBankId, ['old-fact'])
    m.failDelete = true
    const refuse = await request(ws, { type: 'agent.delete', agentId: a2.id })
    expect(refuse.ok).toBe(false)
    await expect(fs.access(path.join(home, 'agents', a2.slug))).resolves.toBeUndefined()
    const still = await request(ws, { type: 'agent.get', agentId: a2.id })
    expect(still.ok).toBe(true)

    m.failDelete = false
    await request(ws, { type: 'agent.delete', agentId: a2.id })
    const fresh = await request(ws, { type: 'agent.create', name: 'Ada' })
    const a3 = (fresh as { agent: { memoryBankId: string } }).agent
    expect(a3.memoryBankId).not.toBe(a2.memoryBankId)
    expect(m.banks.has(a3.memoryBankId)).toBe(false)

    await daemon.stop()
    ws.close()
  })
})
