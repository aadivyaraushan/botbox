import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import {
  connect,
  fakeQueryStream,
  makeFakeFetch,
  request,
  tempHome,
  type FakeMemory,
} from './helpers.js'

function successStream(session = 's1') {
  return fakeQueryStream([
    { type: 'system', subtype: 'init', session_id: session },
    { type: 'stream_event', event: { type: 'message_start' } },
    {
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
    },
    { type: 'result', subtype: 'success', session_id: session, total_cost_usd: 0.02 },
  ])
}

async function loggedInDaemon(mem: FakeMemory, queryFn = successStream()) {
  const home = await tempHome()
  await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
  await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
  const fetchFn = makeFakeFetch(mem)
  const adminToken = randomBytes(32).toString('hex')
  const daemon = new Daemon({
    home,
    adminToken,
    port: 0,
    skipHindsightSpawn: true,
    fetchFn,
    queryFn,
  })
  daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
  const { port } = await daemon.start()
  return { daemon, home, adminToken, port, mem }
}

describe('memory', () => {
  it('retain after user turn; 404 PUT then retry; snapshot; failure leaves file; delete bank first', async () => {
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const { daemon, home, adminToken, port } = await loggedInDaemon(mem)
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; slug: string; memoryBankId: string } }).agent
    mem.retain404Once = new Set([agent.memoryBankId])

    const send = await request(ws, { type: 'chat.send', agentId: agent.id, text: 'remember my cat' })
    expect(send.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 300))

    expect(mem.calls.some((c) => c.method === 'PUT' && c.url.includes(agent.memoryBankId))).toBe(true)
    expect(
      mem.calls.some(
        (c) =>
          c.method === 'POST' &&
          c.url.includes(`/banks/${agent.memoryBankId}/memories`) &&
          !c.url.includes('recall'),
      ),
    ).toBe(true)
    const memoryPath = path.join(home, 'agents', agent.slug, 'MEMORY.md')
    const memory = await fs.readFile(memoryPath, 'utf8')
    expect(memory.startsWith('-')).toBe(true)

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mem.failRetain = true
    await request(ws, { type: 'chat.send', agentId: agent.id, text: 'more' })
    await new Promise((r) => setTimeout(r, 300))
    expect(await fs.readFile(memoryPath, 'utf8')).toBe(memory)
    expect(spy.mock.calls.some((c) => String(c[0]).includes('[memory] agent='))).toBe(true)
    spy.mockRestore()

    mem.failRetain = false
    mem.banks.set(agent.memoryBankId, ['old'])
    const before = mem.calls.length
    await request(ws, { type: 'agent.delete', agentId: agent.id })
    const del = mem.calls.slice(before).find((c) => c.method === 'DELETE')
    expect(del).toBeTruthy()

    await daemon.stop()
    ws.close()
  })

  it('recall failure omits block, logs, memory-error banner', async () => {
    const mem: FakeMemory = { banks: new Map(), calls: [], failRecall: true }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { daemon, adminToken, port } = await loggedInDaemon(mem)
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])
    await request(ws, { type: 'chat.send', agentId: agent.id, text: 'hi' })
    await new Promise((r) => setTimeout(r, 300))
    expect(spy.mock.calls.some((c) => String(c[0]).includes('recall-failed'))).toBe(true)
    const get = await request(ws, { type: 'agent.get', agentId: agent.id })
    expect(
      (get as { banners: Array<{ type: string; message: string }> }).banners.some(
        (b) => b.type === 'memory-error' && b.message.includes('Could not recall'),
      ),
    ).toBe(true)
    spy.mockRestore()
    await daemon.stop()
    ws.close()
  })

  it('delete Ada then create Ada — new bank has no old facts', async () => {
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const { daemon, adminToken, port } = await loggedInDaemon(mem)
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, ['secret-old'])
    await request(ws, { type: 'agent.delete', agentId: agent.id })
    const again = await request(ws, { type: 'agent.create', name: 'Ada' })
    const a2 = (again as { agent: { memoryBankId: string } }).agent
    expect(a2.memoryBankId).not.toBe(agent.memoryBankId)
    expect(mem.banks.get(a2.memoryBankId) ?? []).toEqual([])
    await daemon.stop()
    ws.close()
  })
})
