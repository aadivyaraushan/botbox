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
import type { QueryFn } from '../src/claude/adapter.js'

describe('ask', () => {
  it(
    'canUseTool waits; ask.answer; not-open; enqueue while open',
    async () => {
      let canUseTool: ((name: string, input: Record<string, unknown>) => Promise<unknown>) | null =
        null
      let releaseTurn: () => void = () => {}
      const turnGate = new Promise<void>((r) => {
        releaseTurn = r
      })
      const queryFn: QueryFn = ((args: { options: Record<string, unknown> }) => {
        canUseTool = args.options.canUseTool as typeof canUseTool
        const q = {
          async interrupt() {
            releaseTurn()
          },
          async *[Symbol.asyncIterator]() {
            yield { type: 'system', subtype: 'init', session_id: 's' }
            yield { type: 'stream_event', event: { type: 'message_start' } }
            await turnGate
            yield { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 }
          },
        }
        return q as never
      }) as QueryFn

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
        queryFn,
      })
      daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
      const { port } = await daemon.start()
      const ws = await connect(port, adminToken)
      const created = await request(ws, { type: 'agent.create', name: 'Ada' })
      const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
      mem.banks.set(agent.memoryBankId, [])

      await request(ws, { type: 'chat.send', agentId: agent.id, text: 'ask me' })
      await new Promise((r) => setTimeout(r, 50))
      expect(canUseTool).toBeTruthy()

      const askPromise = canUseTool!('AskUserQuestion', {
        questions: [
          {
            question: 'Ship today?',
            header: 'Ship today?',
            options: [
              { label: 'Today', description: '' },
              { label: 'Tomorrow', description: '' },
            ],
            multiSelect: false,
          },
        ],
      })

      await new Promise((r) => setTimeout(r, 50))
      const hist1 = await request(ws, { type: 'chat.history', agentId: agent.id })
      const openPart = (
        hist1 as {
          turns: Array<{ parts: Array<{ type: string; id: string; status?: string }> }>
        }
      ).turns
        .flatMap((t) => t.parts)
        .find((p) => p.type === 'ask-user-question' && p.status === 'open')!
      expect(openPart).toBeTruthy()

      const queued = await request(ws, { type: 'chat.send', agentId: agent.id, text: 'queued' })
      expect(queued.ok).toBe(true)

      const ans = await request(ws, {
        type: 'ask.answer',
        agentId: agent.id,
        partId: openPart.id,
        answers: { 'Ship today?': 'Today' },
      })
      expect(ans.ok).toBe(true)
      const toolResult = await askPromise
      expect(toolResult).toMatchObject({ behavior: 'allow' })

      const again = await request(ws, {
        type: 'ask.answer',
        agentId: agent.id,
        partId: openPart.id,
        answers: { 'Ship today?': 'Today' },
      })
      expect(again).toMatchObject({ ok: false, error: 'not-open' })

      releaseTurn()
      await new Promise((r) => setTimeout(r, 100))
      await daemon.stop()
      ws.close()
    },
    15_000,
  )

  it('ask.answer with no live callback starts user turn', async () => {
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
      queryFn: fakeQueryStream([
        { type: 'system', subtype: 'init', session_id: 's' },
        { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 },
      ]),
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; slug: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])

    const live = (daemon as unknown as { live: Map<string, { turns: unknown[]; seq: number }> }).live.get(
      agent.id,
    )!
    live.seq = 1
    live.turns.push({
      id: 't1',
      seq: 1,
      agentId: agent.id,
      role: 'assistant',
      source: 'user',
      createdAt: new Date().toISOString(),
      parts: [
        {
          type: 'ask-user-question',
          id: 'ask1',
          questions: [
            {
              question: 'Color?',
              header: 'Color?',
              options: [{ label: 'Red', description: '' }],
              multiSelect: false,
            },
          ],
          status: 'open',
        },
      ],
    })

    const res = await request(ws, {
      type: 'ask.answer',
      agentId: agent.id,
      partId: 'ask1',
      answers: { 'Color?': 'Red' },
    })
    expect(res.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 200))
    const hist = await request(ws, { type: 'chat.history', agentId: agent.id })
    const user = (hist as { turns: Array<{ role: string; parts: Array<{ text?: string }> }> }).turns.find(
      (t) => t.role === 'user',
    )
    expect(user?.parts.some((p) => p.text?.includes('Color?: Red'))).toBe(true)
    await daemon.stop()
    ws.close()
  })
})
