import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { encodeFrame, decodeFrame } from '@openbot/daemon/wire'
import type { AgentConfig } from '@openbot/protocol'
import type { AgentRuntime } from '@openbot/protocol'
import type { Banner } from '@openbot/protocol'
import type { Turn } from '@openbot/protocol'

const PORT = 18799
const TOKEN = 'test-token'

type Conn = {
  scenario: string
  agents: Map<string, { agent: AgentConfig; runtime: AgentRuntime; banners: Banner[]; turns: Turn[] }>
  envelopeId: number
  lastRequests: Array<Record<string, unknown>>
  loggedOutOnCreate: boolean
}

function baseRuntime(agentId: string, overrides: Partial<AgentRuntime> = {}): AgentRuntime {
  return {
    agentId,
    state: 'idle',
    queueCount: 0,
    spendUsdToday: 0.12,
    harnessAuth: { 'claude-code': 'logged-in', codex: 'logged-in' },
    humanControl: { held: false },
    talkingToAgentId: null,
    contextUsed: 1200,
    contextWindow: 200000,
    sessionId: 'sess-1',
    mcp: [
      { name: 'openbot', url: 'http://127.0.0.1:18799/mcp/x', last: 'ok' },
      { name: 'hindsight', url: 'http://127.0.0.1:8888', last: 'ok' },
    ],
    ...overrides,
  }
}

function push(ws: WebSocket, conn: Conn, agentId: string, channel: 'daemon' | 'harness', event: unknown, turnId?: string) {
  conn.envelopeId += 1
  const env =
    channel === 'daemon'
      ? { id: conn.envelopeId, agentId, channel: 'daemon' as const, event }
      : {
          id: conn.envelopeId,
          agentId,
          channel: 'harness' as const,
          turnId: turnId!,
          event,
        }
  ws.send(encodeFrame(env))
}

function makeAgent(name: string, opts?: { loggedOut?: boolean; state?: AgentRuntime['state'] }): Conn['agents'] extends Map<string, infer V> ? V : never {
  const id = randomUUID()
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agent'
  const agent: AgentConfig = {
    id,
    name,
    slug,
    harness: 'claude-code',
    model: 'claude-sonnet-5',
    memoryBankId: randomUUID(),
    createdAt: new Date().toISOString(),
  }
  const runtime = baseRuntime(id, {
    state: opts?.state ?? 'idle',
    harnessAuth: opts?.loggedOut
      ? { 'claude-code': 'logged-out', codex: 'logged-out' }
      : { 'claude-code': 'logged-in', codex: 'logged-in' },
  })
  const banners: Banner[] = []
  const turns: Turn[] = [
    {
      id: randomUUID(),
      seq: 1,
      agentId: id,
      role: 'system',
      source: 'harness-switch-compact',
      parts: [
        {
          type: 'compaction',
          id: randomUUID(),
          reason: 'harness-switch',
          forHarness: 'codex',
        },
      ],
      createdAt: new Date().toISOString(),
    },
  ]
  return { agent, runtime, banners, turns }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.searchParams.get('token') !== TOKEN) {
    ws.close()
    return
  }
  const scenario = url.searchParams.get('scenario') ?? 'app'
  const conn: Conn = {
    scenario,
    agents: new Map(),
    envelopeId: 0,
    lastRequests: [],
    loggedOutOnCreate: false,
  }

  if (scenario === 'peer') {
    const ada = makeAgent('Ada')
    const bea = makeAgent('Bea')
    ada.turns.push({
      id: randomUUID(),
      seq: 2,
      agentId: ada.agent.id,
      role: 'assistant',
      source: 'user',
      parts: [
        {
          type: 'peer-message',
          id: randomUUID(),
          peerAgentId: bea.agent.id,
          peerName: 'Bea',
          direction: 'sent',
          text: 'Please help',
        },
      ],
      createdAt: new Date().toISOString(),
    })
    bea.turns.push({
      id: randomUUID(),
      seq: 2,
      agentId: bea.agent.id,
      role: 'assistant',
      source: 'peer',
      parts: [
        {
          type: 'peer-message',
          id: randomUUID(),
          peerAgentId: ada.agent.id,
          peerName: 'Ada',
          direction: 'received',
          text: 'Please help',
        },
      ],
      createdAt: new Date().toISOString(),
    })
    conn.agents.set(ada.agent.id, ada)
    conn.agents.set(bea.agent.id, bea)
  }

  ws.on('message', (raw) => {
    const decoded = decodeFrame(String(raw))
    if (!decoded.ok) return
    const msg = decoded.value as Record<string, unknown>
    const id = String(msg.id ?? '')
    const type = String(msg.type ?? '')
    conn.lastRequests.push(msg)

    const reply = (body: Record<string, unknown>) => {
      ws.send(encodeFrame({ id, type: 'response', ...body }))
    }

    if (type === 'event.stream') {
      reply({ ok: true })
      return
    }

    if (type === 'agent.list') {
      reply({
        ok: true,
        agents: [...conn.agents.values()].map((a) => ({
          agent: a.agent,
          runtime: a.runtime,
          banners: a.banners,
        })),
      })
      return
    }

    if (type === 'agent.create') {
      const name = typeof msg.name === 'string' ? msg.name.trim() : ''
      const description = typeof msg.description === 'string' ? msg.description.trim() : ''
      if (!name && !description) {
        reply({ ok: false, error: 'need-name-or-description' })
        return
      }
      let derived =
        name ||
        description
          .split(/\s+/)[0]!
          .replace(/[^a-zA-Z0-9]/g, '')
          .replace(/^./, (c) => c.toUpperCase()) ||
        'Agent'
      let startState: AgentRuntime['state'] = 'idle'
      let loggedOut = Boolean(msg.forceLoggedOut) || conn.loggedOutOnCreate
      if (derived.startsWith('LoggedOut')) {
        loggedOut = true
        derived = derived.replace(/^LoggedOut/, '') || 'Ada'
      }
      if (derived.startsWith('Paused')) {
        startState = 'paused'
        derived = derived.replace(/^Paused/, '') || 'Ada'
      }
      if (derived.startsWith('Thinking')) {
        startState = 'thinking'
        derived = derived.replace(/^Thinking/, '') || 'Ada'
      }
      if (derived.startsWith('Memorizing')) {
        startState = 'memorizing'
        derived = derived.replace(/^Memorizing/, '') || 'Ada'
      }
      const row = makeAgent(derived, { loggedOut, state: startState })
      if (loggedOut) {
        const banner: Banner = {
          kind: 'banner',
          bannerId: randomUUID(),
          agentId: row.agent.id,
          type: 'needs-login',
          harness: 'claude-code',
          message: 'Sign in to Claude Code to continue.',
          actions: ['log-in', 'dismiss'],
        }
        row.banners.push(banner)
      }
      // Fixture: first create in app scenario starts thinking after list/models dance via chat
      conn.agents.set(row.agent.id, row)
      reply({ ok: true, agent: row.agent, runtime: row.runtime, banners: row.banners })
      if (loggedOut && row.banners[0]) {
        push(ws, conn, row.agent.id, 'daemon', row.banners[0])
      }
      return
    }

    if (type === 'agent.get') {
      const agentId = String(msg.agentId)
      const row = conn.agents.get(agentId)
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      reply({ ok: true, agent: row.agent, runtime: row.runtime, banners: row.banners })
      return
    }

    if (type === 'agent.models') {
      const agentId = String(msg.agentId)
      if (!conn.agents.has(agentId)) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      reply({
        ok: true,
        models: [
          {
            id: 'claude-sonnet-5',
            displayName: 'Sonnet 5',
            efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
          },
        ],
      })
      return
    }

    if (type === 'agent.setModel') {
      const agentId = String(msg.agentId)
      const row = conn.agents.get(agentId)
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      row.agent = {
        ...row.agent,
        model: String(msg.model),
        effort: typeof msg.effort === 'string' ? msg.effort : row.agent.effort,
      }
      reply({ ok: true, agent: row.agent })
      return
    }

    if (type === 'agent.skills') {
      reply({ ok: true, skills: [{ name: 'draft', body: 'Draft it.' }] })
      return
    }

    if (type === 'agent.rename') {
      const agentId = String(msg.agentId)
      const row = conn.agents.get(agentId)
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      const name = String(msg.name ?? '').trim()
      if (!name) {
        reply({ ok: false, error: 'invalid-name' })
        return
      }
      row.agent = { ...row.agent, name }
      reply({ ok: true, agent: row.agent })
      return
    }

    if (type === 'agent.delete') {
      conn.agents.delete(String(msg.agentId))
      reply({ ok: true })
      return
    }

    if (type === 'agent.pause') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      row.runtime = { ...row.runtime, state: 'paused' }
      push(ws, conn, row.agent.id, 'daemon', { kind: 'agent-runtime', runtime: row.runtime })
      reply({ ok: true })
      return
    }

    if (type === 'agent.resume') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      row.runtime = { ...row.runtime, state: 'thinking' }
      push(ws, conn, row.agent.id, 'daemon', { kind: 'agent-runtime', runtime: row.runtime })
      const turnId = randomUUID()
      push(
        ws,
        conn,
        row.agent.id,
        'harness',
        {
          kind: 'turn-created',
          turnId,
          seq: 99,
          role: 'assistant',
          source: 'resume-continue',
          createdAt: new Date().toISOString(),
        },
        turnId,
      )
      reply({ ok: true })
      return
    }

    if (type === 'agent.compact') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      const turnId = randomUUID()
      const partId = randomUUID()
      const turn: Turn = {
        id: turnId,
        seq: row.turns.length + 1,
        agentId: row.agent.id,
        role: 'system',
        source: 'compact',
        parts: [{ type: 'compaction', id: partId, reason: 'manual' }],
        createdAt: new Date().toISOString(),
      }
      row.turns.push(turn)
      push(
        ws,
        conn,
        row.agent.id,
        'harness',
        {
          kind: 'turn-created',
          turnId,
          seq: turn.seq,
          role: 'system',
          source: 'compact',
          createdAt: turn.createdAt,
        },
        turnId,
      )
      push(
        ws,
        conn,
        row.agent.id,
        'harness',
        { kind: 'compacted', partId, reason: 'manual' },
        turnId,
      )
      reply({ ok: true })
      return
    }

    if (type === 'agent.clear') {
      reply({ ok: true })
      return
    }

    if (type === 'agent.setFast') {
      const row = conn.agents.get(String(msg.agentId))
      if (row) row.agent = { ...row.agent, fast: Boolean(msg.fast) }
      reply({ ok: true, agent: row?.agent })
      return
    }

    if (type === 'agent.setHarness') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      if (row.runtime.state === 'thinking') {
        reply({ ok: false, error: 'busy' })
        return
      }
      row.agent = { ...row.agent, harness: msg.harness as AgentConfig['harness'] }
      reply({ ok: true, agent: row.agent })
      return
    }

    if (type === 'chat.history') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      reply({ ok: true, turns: row.turns, lastEnvelopeId: conn.envelopeId })
      return
    }

    if (type === 'chat.send') {
      const row = conn.agents.get(String(msg.agentId))
      if (!row) {
        reply({ ok: false, error: 'agent-not-found' })
        return
      }
      if (row.runtime.harnessAuth[row.agent.harness] === 'logged-out') {
        const banner: Banner = {
          kind: 'banner',
          bannerId: randomUUID(),
          agentId: row.agent.id,
          type: 'needs-login',
          harness: row.agent.harness,
          message: 'Sign in to continue.',
          actions: ['log-in', 'dismiss'],
        }
        row.banners = [...row.banners.filter((b) => b.type !== 'needs-login'), banner]
        push(ws, conn, row.agent.id, 'daemon', banner)
        reply({ ok: false, error: 'needs-login' })
        return
      }
      const text = String(msg.text ?? '')
      if (!text.trim()) {
        reply({ ok: false, error: 'text-empty' })
        return
      }
      const userTurnId = randomUUID()
      row.turns.push({
        id: userTurnId,
        seq: row.turns.length + 1,
        agentId: row.agent.id,
        role: 'user',
        source: 'user',
        parts: [{ type: 'text', id: randomUUID(), text }],
        createdAt: new Date().toISOString(),
      })
      const assistantTurnId = randomUUID()
      row.runtime = { ...row.runtime, state: 'thinking' }
      push(ws, conn, row.agent.id, 'daemon', { kind: 'agent-runtime', runtime: row.runtime })
      push(
        ws,
        conn,
        row.agent.id,
        'harness',
        {
          kind: 'turn-created',
          turnId: assistantTurnId,
          seq: row.turns.length + 1,
          role: 'assistant',
          source: 'user',
          createdAt: new Date().toISOString(),
        },
        assistantTurnId,
      )
      const partId = randomUUID()
      push(
        ws,
        conn,
        row.agent.id,
        'harness',
        { kind: 'reasoning-text', partId, delta: 'Working.' },
        assistantTurnId,
      )
      row.turns.push({
        id: assistantTurnId,
        seq: row.turns.length + 1,
        agentId: row.agent.id,
        role: 'assistant',
        source: 'user',
        parts: [{ type: 'reasoning', id: partId, text: 'Working.' }],
        createdAt: new Date().toISOString(),
      })
      reply({ ok: true, turnId: assistantTurnId })
      return
    }

    if (type === 'harness.startLogin') {
      reply({ ok: true })
      return
    }

    reply({ ok: false, error: 'unknown-type' })
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-daemon] http://127.0.0.1:${PORT}/health`)
})
