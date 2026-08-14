import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { connect, request, startTestDaemon } from './helpers.js'

describe('agent.files / agent.readFile', () => {
  it('lists role.md, MEMORY.md, then workspace paths; skips browser-profile and node_modules', async () => {
    const { daemon, home, adminToken, port } = await startTestDaemon()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    expect(created.ok).toBe(true)
    const agentId = (created as { agent: { id: string; slug: string } }).agent.id
    const slug = (created as { agent: { slug: string } }).agent.slug
    const dir = path.join(home, 'agents', slug)

    await fs.writeFile(path.join(dir, 'MEMORY.md'), 'hello', 'utf8')
    await fs.writeFile(path.join(dir, 'browser-history.jsonl'), '', 'utf8')
    await fs.mkdir(path.join(dir, 'workspace', 'node_modules', 'pkg'), { recursive: true })
    await fs.writeFile(path.join(dir, 'workspace', 'node_modules', 'pkg', 'index.js'), 'x', 'utf8')
    await fs.mkdir(path.join(dir, 'workspace', '.git'), { recursive: true })
    await fs.writeFile(path.join(dir, 'workspace', '.git', 'HEAD'), 'ref', 'utf8')
    await fs.writeFile(path.join(dir, 'workspace', 'z.txt'), 'z', 'utf8')
    await fs.writeFile(path.join(dir, 'workspace', 'a.txt'), 'a', 'utf8')
    await fs.mkdir(path.join(dir, 'workspace', 'sub'), { recursive: true })
    await fs.writeFile(path.join(dir, 'workspace', 'sub', 'b.txt'), 'b', 'utf8')
    await fs.mkdir(path.join(home, 'private', slug, 'browser-profile'), { recursive: true })
    await fs.writeFile(path.join(home, 'private', slug, 'browser-profile', 'Cookies'), 'x', 'utf8')

    const listed = await request(ws, { type: 'agent.files', agentId })
    expect(listed.ok).toBe(true)
    const files = (listed as { files: string[] }).files
    expect(files[0]).toBe('role.md')
    expect(files[1]).toBe('MEMORY.md')
    expect(files.slice(2)).toEqual([...files.slice(2)].sort((a, b) => a.localeCompare(b)))
    expect(files.slice(2).every((p) => p.startsWith('workspace/'))).toBe(true)
    expect(files).toContain('workspace/a.txt')
    expect(files).toContain('workspace/z.txt')
    expect(files).toContain('workspace/sub/b.txt')
    expect(files.some((p) => p.includes('browser-profile'))).toBe(false)
    expect(files.some((p) => p.includes('node_modules'))).toBe(false)
    expect(files.some((p) => p.includes('.git'))).toBe(false)
    expect(files).not.toContain('browser-history.jsonl')

    const mem = await request(ws, { type: 'agent.readFile', agentId, path: 'MEMORY.md' })
    expect(mem).toMatchObject({ ok: true, text: 'hello' })

    await daemon.stop()
    ws.close()
  })

  it('forbids path traversal to another agent folder', async () => {
    const { daemon, home, adminToken, port } = await startTestDaemon()
    const ws = await connect(port, adminToken)
    const ada = await request(ws, { type: 'agent.create', name: 'Ada' })
    const bea = await request(ws, { type: 'agent.create', name: 'Bea' })
    expect(ada.ok).toBe(true)
    expect(bea.ok).toBe(true)
    const adaId = (ada as { agent: { id: string } }).agent.id
    const beaSlug = (bea as { agent: { slug: string } }).agent.slug
    await fs.writeFile(path.join(home, 'agents', beaSlug, 'MEMORY.md'), 'bea-mem', 'utf8')

    const cross = await request(ws, {
      type: 'agent.readFile',
      agentId: adaId,
      path: '../../bea/MEMORY.md',
    })
    expect(cross).toMatchObject({ ok: false, error: 'forbidden' })

    const missing = await request(ws, {
      type: 'agent.readFile',
      agentId: adaId,
      path: 'nope.md',
    })
    expect(missing).toMatchObject({ ok: false, error: 'not-found' })

    const unknown = await request(ws, {
      type: 'agent.files',
      agentId: 'missing-id',
    })
    expect(unknown).toMatchObject({ ok: false, error: 'agent-not-found' })

    await daemon.stop()
    ws.close()
  })
})
