import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import { applyEvent } from '../src/turns/reducer.js'
import {
  connect,
  fakeQueryStream,
  makeFakeFetch,
  request,
  tempHome,
  type FakeMemory,
} from './helpers.js'
import type { TurnPart } from '@openbot/protocol'

async function boot(queryFn: ReturnType<typeof fakeQueryStream>, mem?: FakeMemory) {
  const home = await tempHome()
  await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
  await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
  const m: FakeMemory = mem ?? { banks: new Map(), calls: [] }
  const fetchFn = makeFakeFetch(m)
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
  return { daemon, home, adminToken, port, ws, mem: m }
}

describe('turns', () => {
  it('two-row send; turnId before harness; history; parts; pause; spend rollover; model/effort', async () => {
    const recorded: unknown[] = []
    const queryFn = fakeQueryStream(
      [
        { type: 'system', subtype: 'init', session_id: 'sess-a' },
        { type: 'stream_event', event: { type: 'message_start' } },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'thinking_delta', thinking: 'think1' },
          },
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 1,
            delta: { type: 'text_delta', text: 'hello' },
          },
        },
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'dup' },
              { type: 'text', text: 'dup' },
              { type: 'tool_use', id: 'tool1', name: 'Bash', input: { command: 'ls' } },
            ],
          },
        },
        {
          type: 'user',
          message: {
            content: [{ type: 'tool_result', tool_use_id: 'tool1', content: 'ok', is_error: false }],
          },
        },
        { type: 'stream_event', event: { type: 'message_start' } },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'second' },
          },
        },
        {
          type: 'result',
          subtype: 'success',
          session_id: 'sess-a',
          total_cost_usd: 0.05,
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      ],
      { record: recorded },
    )

    const { daemon, home, ws, mem } = await boot(queryFn)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; slug: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])

    // set effort on team.json
    const team = JSON.parse(await fs.readFile(path.join(home, 'team.json'), 'utf8')) as {
      agents: Array<Record<string, unknown>>
    }
    team.agents[0]!.effort = 'high'
    await fs.writeFile(path.join(home, 'team.json'), JSON.stringify(team))
    // reload effort — team already in memory; patch via setFast style — recreate agent field on daemon
    ;(daemon as unknown as { team: Array<{ effort?: string }> }).team[0]!.effort = 'high'

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const y = yesterday.toISOString().slice(0, 10)
    await fs.mkdir(path.join(home, 'private', agent.slug), { recursive: true })
    await fs.writeFile(
      path.join(home, 'private', agent.slug, 'spend.json'),
      JSON.stringify({ date: y, usd: 9.99 }),
    )
    const live = (daemon as unknown as { live: Map<string, { spendDate: string; spendUsd: number }> }).live.get(
      agent.id,
    )!
    live.spendDate = y
    live.spendUsd = 9.99

    const events: unknown[] = []
    ws.on('message', (d) => {
      try {
        events.push(JSON.parse(String(d)))
      } catch {
        /* */
      }
    })

    const send = await request(ws, { type: 'chat.send', agentId: agent.id, text: 'hi' })
    expect(send.ok).toBe(true)
    const turnId = (send as { turnId: string }).turnId
    expect(turnId).toBeTruthy()
    // response arrived — harness events may follow
    await new Promise((r) => setTimeout(r, 400))

    const createdEv = events.filter(
      (e) => (e as { channel?: string; event?: { kind?: string } }).channel === 'harness',
    )
    const kinds = createdEv.map((e) => (e as { event: { kind: string } }).event.kind)
    expect(kinds).toContain('turn-created')
    expect(kinds).toContain('reasoning-text')
    expect(kinds).toContain('assistant-text')

    const hist = await request(ws, { type: 'chat.history', agentId: agent.id })
    expect(hist.ok).toBe(true)
    expect((hist as { lastEnvelopeId: number }).lastEnvelopeId).toBeGreaterThan(0)
    const turns = (hist as { turns: Array<{ role: string; id: string; parts: TurnPart[] }> }).turns
    expect(turns.some((t) => t.role === 'user')).toBe(true)
    expect(turns.some((t) => t.role === 'assistant')).toBe(true)
    const asst = turns.find((t) => t.id === turnId)!
    const partTypes = asst.parts.map((p) => p.type)
    expect(partTypes).toContain('reasoning')
    expect(partTypes).toContain('text')
    expect(partTypes).toContain('tool')

    // thread.jsonl one line per turnId
    const raw = await fs.readFile(path.join(home, 'private', agent.slug, 'thread.jsonl'), 'utf8')
    const lines = raw.trim().split('\n').filter(Boolean)
    const ids = lines.map((l) => JSON.parse(l).id)
    expect(new Set(ids).size).toBe(ids.length)

    const opts = recorded[0] as { options: { model: string; effort?: string } }
    expect(opts.options.model).toBe('claude-sonnet-5')
    expect(opts.options.effort).toBe('high')

    const spend = JSON.parse(
      await fs.readFile(path.join(home, 'private', agent.slug, 'spend.json'), 'utf8'),
    ) as { date: string; usd: number }
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(spend.date).toBe(todayStr)
    expect(spend.usd).toBe(0.05)

    await daemon.stop()
    ws.close()
  })

  it('fake spawn failure within 60s → error state', async () => {
    const queryFn = fakeQueryStream([]) // no messages → timer path; use throw
    const throwing: typeof queryFn = () => {
      const q = {
        async interrupt() {},
        async *[Symbol.asyncIterator]() {
          throw new Error('boom')
        },
      }
      return q as never
    }
    const { daemon, ws, mem } = await boot(throwing)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])
    await request(ws, { type: 'chat.send', agentId: agent.id, text: 'x' })
    await new Promise((r) => setTimeout(r, 200))
    const get = await request(ws, { type: 'agent.get', agentId: agent.id })
    expect((get as { runtime: { state: string } }).runtime.state).toBe('error')
    await daemon.stop()
    ws.close()
  })

  it('chat.send while logged-out returns needs-login', async () => {
    const home = await tempHome()
    const adminToken = randomBytes(32).toString('hex')
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      queryFn: fakeQueryStream([]),
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agentId = (created as { agent: { id: string } }).agent.id
    const res = await request(ws, { type: 'chat.send', agentId, text: 'hi' })
    expect(res).toMatchObject({ ok: false, error: 'needs-login' })
    await daemon.stop()
    ws.close()
  })

  it('applyEvent merges deltas and keeps separate reasoning/text', () => {
    let parts: TurnPart[] = []
    parts = applyEvent(parts, { kind: 'reasoning-text', partId: 'm0c0', delta: 'a' })
    parts = applyEvent(parts, { kind: 'reasoning-text', partId: 'm0c0', delta: 'b' })
    parts = applyEvent(parts, { kind: 'assistant-text', partId: 'm0c1', delta: 'x' })
    parts = applyEvent(parts, { kind: 'tool-use', callId: 't1', name: 'Bash', inputSummary: 'ls' })
    parts = applyEvent(parts, { kind: 'assistant-text', partId: 'm1c0', delta: 'y' })
    expect(parts.map((p) => p.type)).toEqual(['reasoning', 'text', 'tool', 'text'])
    expect((parts[0] as { text: string }).text).toBe('ab')
  })

  it('visible divider turn-created includes createdAt', async () => {
    const { daemon, ws, mem } = await boot(
      fakeQueryStream([
        { type: 'system', subtype: 'init', session_id: 's' },
        { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 },
      ]),
    )
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])
    const events: Array<{ event?: { kind?: string; createdAt?: string } }> = []
    ws.on('message', (d) => events.push(JSON.parse(String(d))))
    await request(ws, { type: 'chat.send', agentId: agent.id, text: 'hi' })
    await new Promise((r) => setTimeout(r, 200))
    const tc = events.find((e) => e.event?.kind === 'turn-created')
    expect(tc?.event?.createdAt).toMatch(/T/)
    await daemon.stop()
    ws.close()
  })
})
