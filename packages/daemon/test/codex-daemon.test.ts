import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import {
  connect,
  makeFakeFetch,
  request,
  tempHome,
  type FakeMemory,
} from './helpers.js'
import type { CodexRunTurnHandle } from '../src/codex/adapter.js'

describe('daemon codex wiring', () => {
  it('agent.setModel + agent.setHarness empty-slice switch to codex', async () => {
    const home = await tempHome()
    await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
    await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
    await fs.mkdir(path.join(home, 'codex-home'), { recursive: true })
    await fs.writeFile(path.join(home, 'codex-home', 'auth.json'), '{}')

    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const adminToken = randomBytes(32).toString('hex')

    const codexTurnFn = (() => {
      const handle: CodexRunTurnHandle = {
        interrupt: async () => {},
        done: Promise.resolve({
          sessionId: 'codex-sess',
          outcome: 'complete' as const,
          usage: { costUsd: null, inputTokens: 1, outputTokens: 1 },
          spawn: { argv: ['codex', 'app-server'], detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
        }),
      }
      return handle
    }) as unknown as typeof import('../src/codex/adapter.js').runCodexTurn

    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      codexTurnFn,
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Ada' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])

    const model = await request(ws, {
      type: 'agent.setModel',
      agentId: agent.id,
      model: 'claude-sonnet-5',
      effort: 'high',
    })
    expect(model.ok).toBe(true)

    const sw = await request(ws, {
      type: 'agent.setHarness',
      agentId: agent.id,
      harness: 'codex',
    })
    expect(sw.ok).toBe(true)
    expect((sw as { harness?: string }).harness).toBe('codex')

    const got = await request(ws, { type: 'agent.get', agentId: agent.id })
    expect((got as { agent: { harness: string; model: string } }).agent.harness).toBe('codex')
    expect((got as { agent: { model: string } }).agent.model).toBe('gpt-5.6-luna')

    // chat on codex path
    const send = await request(ws, { type: 'chat.send', agentId: agent.id, text: 'hi' })
    expect(send.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 50))

    await daemon.stop()
    ws.close()
  }, 15_000)

  it('paused switch with stopped-turn only rewrites harness+session and continues', async () => {
    const home = await tempHome()
    await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
    await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
    await fs.mkdir(path.join(home, 'codex-home'), { recursive: true })
    await fs.writeFile(path.join(home, 'codex-home', 'auth.json'), '{}')

    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const adminToken = randomBytes(32).toString('hex')
    let continued = false
    const codexTurnFn = ((opts: { promptText: string; sessionId?: string | null }) => {
      if (opts.promptText.includes('Continue the work')) continued = true
      const handle: CodexRunTurnHandle = {
        interrupt: async () => {},
        done: Promise.resolve({
          sessionId: opts.sessionId ?? 'codex-new',
          outcome: 'complete' as const,
          usage: { costUsd: null },
          spawn: { argv: ['codex'], detached: true, stdio: ['pipe', 'pipe', 'pipe'] },
        }),
      }
      return handle
    }) as unknown as typeof import('../src/codex/adapter.js').runCodexTurn

    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      codexTurnFn,
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Bea' })
    const agent = (created as { agent: { id: string; slug: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])

    // pause idle then write stopped-turn
    await request(ws, { type: 'agent.pause', agentId: agent.id })
    const priv = path.join(home, 'private', agent.slug)
    await fs.mkdir(priv, { recursive: true })
    await fs.writeFile(
      path.join(priv, 'stopped-turn.json'),
      JSON.stringify({
        turnId: 't1',
        harness: 'claude-code',
        sessionId: 'old',
        interruptedAt: new Date().toISOString(),
        summaryText: 'was doing work',
        junk: true,
      }),
    )

    const sw = await request(ws, {
      type: 'agent.setHarness',
      agentId: agent.id,
      harness: 'codex',
    })
    expect(sw.ok).toBe(true)
    await new Promise((r) => setTimeout(r, 80))
    const stopped = JSON.parse(await fs.readFile(path.join(priv, 'stopped-turn.json'), 'utf8'))
    expect(stopped.harness).toBe('codex')
    expect(stopped.junk).toBeUndefined()
    expect(continued).toBe(true)

    await daemon.stop()
    ws.close()
  }, 15_000)

  it('setModel invalid-model; setHarness needs-login and busy', async () => {
    const home = await tempHome()
    await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
    await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
    // no codex auth → needs-login
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const adminToken = randomBytes(32).toString('hex')
    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const created = await request(ws, { type: 'agent.create', name: 'Cara' })
    const agent = (created as { agent: { id: string; memoryBankId: string } }).agent
    mem.banks.set(agent.memoryBankId, [])

    const bad = await request(ws, {
      type: 'agent.setModel',
      agentId: agent.id,
      model: 'no-such-model',
    })
    expect(bad).toMatchObject({ ok: false, error: 'invalid-model' })

    const needs = await request(ws, {
      type: 'agent.setHarness',
      agentId: agent.id,
      harness: 'codex',
    })
    expect(needs).toMatchObject({ ok: false, error: 'needs-login' })

    // create codex auth then busy path
    await fs.mkdir(path.join(home, 'codex-home'), { recursive: true })
    await fs.writeFile(path.join(home, 'codex-home', 'auth.json'), '{}')
    // refresh auth detection via another get? detectAuth on start - restart auth by chatting after writing auth
    // Force busy: send chat then setHarness while thinking
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const queryFn = ((args: { options: Record<string, unknown> }) => {
      void args
      return {
        async interrupt() {
          release()
        },
        async *[Symbol.asyncIterator]() {
          yield { type: 'system', subtype: 'init', session_id: 's' }
          await gate
          yield { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0.01 }
        },
      } as never
    }) as import('../src/claude/adapter.js').QueryFn

    // rebuild daemon with queryFn for busy - stop and restart simpler: just call setHarness while thinking via existing
    await daemon.stop()
    ws.close()

    const daemon2 = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      queryFn,
    })
    daemon2.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port: port2 } = await daemon2.start()
    const ws2 = await connect(port2, adminToken)
    await request(ws2, { type: 'chat.send', agentId: agent.id, text: 'busy now' })
    await new Promise((r) => setTimeout(r, 30))
    const busy = await request(ws2, {
      type: 'agent.setHarness',
      agentId: agent.id,
      harness: 'codex',
    })
    expect(busy).toMatchObject({ ok: false, error: 'busy' })
    release()
    await new Promise((r) => setTimeout(r, 50))
    await daemon2.stop()
    ws2.close()
  }, 20_000)
})
