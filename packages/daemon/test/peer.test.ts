import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
import { LIST_AGENTS_DESC, MESSAGE_AGENT_DESC } from '../src/mcp/peer-tools.js'

function stream() {
  return fakeQueryStream([
    { type: 'system', subtype: 'init', session_id: 's' },
    { type: 'stream_event', event: { type: 'message_start' } },
    {
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ok' } },
    },
    { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 },
  ])
}

async function twoAgents() {
  const home = await tempHome()
  await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
  await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
  const mem: FakeMemory = { banks: new Map(), calls: [] }
  const fetchFn = makeFakeFetch(mem)
  const adminToken = randomBytes(32).toString('hex')
  const daemon = new Daemon({
    home,
    adminToken,
    port: 0,
    skipHindsightSpawn: true,
    fetchFn,
    queryFn: stream(),
  })
  daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
  const { port } = await daemon.start()
  const ws = await connect(port, adminToken)
  const a = (await request(ws, { type: 'agent.create', name: 'Ada' })) as {
    agent: { id: string; memoryBankId: string }
  }
  const b = (await request(ws, { type: 'agent.create', name: 'Bea' })) as {
    agent: { id: string; memoryBankId: string }
  }
  mem.banks.set(a.agent.memoryBankId, [])
  mem.banks.set(b.agent.memoryBankId, [])
  return { daemon, ws, mem, ada: a.agent, bea: b.agent, port, adminToken }
}

describe('peer', () => {
  it('message_agent missing id → not-found, no peer-message on A', async () => {
    const { daemon, ada, ws } = await twoAgents()
    const res = await daemon.peerSend(ada.id, 'missing', 'hi')
    expect(res).toEqual({ ok: false, error: 'not-found' })
    await daemon.stop()
    ws.close()
  })

  it('7+ peer turns still succeed (no rate limit)', async () => {
    const { daemon, ada, bea, ws } = await twoAgents()
    for (let i = 0; i < 8; i++) {
      const r = await daemon.peerSend(ada.id, bea.id, `msg-${i}`)
      expect(r.ok).toBe(true)
    }
    await daemon.stop()
    ws.close()
  })

  it(
    'peer while B thinking appends received on in-flight row',
    async () => {
      let release!: () => void
      const gate = new Promise<void>((r) => {
        release = r
      })
      const home = await tempHome()
      await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
      await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
      const mem: FakeMemory = { banks: new Map(), calls: [] }
      const fetchFn = makeFakeFetch(mem)
      const adminToken = randomBytes(32).toString('hex')
      const queryFn = (() => {
        return {
          async interrupt() {
            release()
          },
          async *[Symbol.asyncIterator]() {
            yield { type: 'system', subtype: 'init', session_id: 's' }
            yield { type: 'stream_event', event: { type: 'message_start' } }
            yield {
              type: 'stream_event',
              event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '...' } },
            }
            await gate
            yield { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 }
          },
        } as never
      }) as typeof stream

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
      const ws = await connect(port, adminToken)
      const a = (await request(ws, { type: 'agent.create', name: 'Ada' })) as {
        agent: { id: string; memoryBankId: string }
      }
      const b = (await request(ws, { type: 'agent.create', name: 'Bea' })) as {
        agent: { id: string; memoryBankId: string }
      }
      mem.banks.set(a.agent.memoryBankId, [])
      mem.banks.set(b.agent.memoryBankId, [])
      await request(ws, { type: 'chat.send', agentId: b.agent.id, text: 'work' })
      await new Promise((r) => setTimeout(r, 80))
      await daemon.peerSend(a.agent.id, b.agent.id, 'ping while busy')
      const hist = await request(ws, { type: 'chat.history', agentId: b.agent.id })
      const asst = (
        hist as {
          turns: Array<{ role: string; parts: Array<{ type: string; direction?: string }> }>
        }
      ).turns.find((t) => t.role === 'assistant')!
      expect(asst.parts.some((p) => p.type === 'peer-message' && p.direction === 'received')).toBe(true)
      release()
      await new Promise((r) => setTimeout(r, 100))
      await daemon.stop()
      ws.close()
    },
    15_000,
  )

  it('description strings match plan literals', () => {
    expect(LIST_AGENTS_DESC).toContain('List the other people')
    expect(MESSAGE_AGENT_DESC).toContain('Send work to another agent')
  })
})
