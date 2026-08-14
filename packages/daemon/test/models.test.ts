import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadClaudeCatalog, loadCodexCatalog } from '../src/claude/models.js'
import { connect, request, startTestDaemon } from './helpers.js'

describe('agent.models', () => {
  it('Claude catalog includes full efforts list', () => {
    const models = loadClaudeCatalog()
    for (const m of models) {
      expect(m.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    }
  })

  it('missing Codex cache returns luna fallback and logs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'm-'))
    const models = loadCodexCatalog(home)
    expect(models.some((m) => m.id === 'gpt-5.6-luna')).toBe(true)
    expect(spy.mock.calls.some((c) => String(c[0]).includes('catalog-missing harness=codex'))).toBe(
      true,
    )
    spy.mockRestore()
  })

  it('Codex catalog hides non-list and codex-auto-review', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'm2-'))
    fs.writeFileSync(
      path.join(home, 'codex-models.json'),
      JSON.stringify([
        { id: 'gpt-5.6-luna', displayName: 'Luna' },
        { id: 'codex-auto-review', displayName: 'Auto' },
        { id: 'non-list-foo', displayName: 'Nope' },
      ]),
    )
    const models = loadCodexCatalog(home)
    expect(models.map((m) => m.id)).toEqual(['gpt-5.6-luna'])
  })

  it('agent.models via WS', async () => {
    const { daemon, adminToken, port } = await startTestDaemon()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agentId = (created as { agent: { id: string } }).agent.id
    const res = await request(ws, { type: 'agent.models', agentId })
    expect(res.ok).toBe(true)
    expect((res as { models: unknown[] }).models.length).toBeGreaterThan(0)
    await daemon.stop()
    ws.close()
  })
})
