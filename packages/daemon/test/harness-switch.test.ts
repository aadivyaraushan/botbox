import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentConfig, Turn } from '@openbot/protocol'
import {
  buildCompactSlice,
  rewriteStoppedTurnHarness,
  switchHarness,
  type SessionsFile,
} from '../src/harness/switch.js'

function agent(over: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'ada',
    name: 'Ada',
    slug: 'ada',
    harness: 'claude-code',
    model: 'claude-sonnet-5',
    memoryBankId: 'bank',
    createdAt: new Date().toISOString(),
    ...over,
  }
}

function turn(partial: Partial<Turn> & Pick<Turn, 'seq' | 'role'>): Turn {
  return {
    id: `t-${partial.seq}`,
    agentId: 'ada',
    harness: 'claude-code',
    source: 'user',
    parts: [{ type: 'text', id: 'p', text: 'hello' }],
    createdAt: new Date().toISOString(),
    ...partial,
  } as Turn
}

describe('harness switch helpers', () => {
  it('empty slice when nothing after lastInjectedSeq', () => {
    const turns = [turn({ seq: 1, role: 'user' }), turn({ seq: 2, role: 'assistant' })]
    expect(buildCompactSlice(turns, 2)).toBe('')
    expect(buildCompactSlice(turns, 0).length).toBeGreaterThan(0)
  })

  it('paused stopped-turn ONLY rewrites harness+sessionId', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-sw-'))
    const stoppedPath = path.join(dir, 'stopped-turn.json')
    await fs.writeFile(
      stoppedPath,
      JSON.stringify({
        turnId: 't1',
        harness: 'claude-code',
        sessionId: 'old',
        interruptedAt: '2026-01-01T00:00:00.000Z',
        summaryText: 'was working',
        extraShouldStay: true,
      }),
      'utf8',
    )
    const out = await rewriteStoppedTurnHarness({
      stoppedPath,
      harness: 'codex',
      sessionId: 'new-sess',
    })
    expect(out?.harness).toBe('codex')
    expect(out?.sessionId).toBe('new-sess')
    const raw = JSON.parse(await fs.readFile(stoppedPath, 'utf8')) as Record<string, unknown>
    expect(raw.harness).toBe('codex')
    expect(raw.sessionId).toBe('new-sess')
    expect(raw.summaryText).toBe('was working')
    expect(raw.extraShouldStay).toBeUndefined()
  })
})

describe('switchHarness', () => {
  it('empty slice flips without compacted; paused+stopped continues', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-sw2-'))
    const stoppedPath = path.join(dir, 'stopped-turn.json')
    await fs.writeFile(
      stoppedPath,
      JSON.stringify({
        turnId: 't1',
        harness: 'claude-code',
        sessionId: 'claude-sess',
        interruptedAt: new Date().toISOString(),
        summaryText: 'continue me',
      }),
      'utf8',
    )
    const sessions: SessionsFile = {
      'claude-code': 'claude-sess',
      codex: null,
      lastInjectedSeq: { 'claude-code': 0, codex: 0 },
    }
    const events: unknown[] = []
    let resumeCalls = 0
    let createdSession = false
    const result = await switchHarness({
      agent: agent(),
      toHarness: 'codex',
      state: 'paused',
      turns: [],
      sessions,
      privateDir: dir,
      loadCompactPrompt: () => 'prompt',
      runCompact: async () => ({ ok: true, text: 'brief' }),
      runInject: async () => ({ ok: true, sessionId: 'x' }),
      createDestinationSession: async () => {
        createdSession = true
        return 'codex-new'
      },
      persistSessions: async () => {},
      persistAgentHarness: async (h, model) => agent({ harness: h, model }),
      pushHarness: (_id, ev) => events.push(ev),
      pushTurnCreated: (t) => events.push(t),
      startResumeContinue: async () => {
        resumeCalls += 1
      },
      setRuntimeState: () => {},
      defaultModelFor: (h) => (h === 'codex' ? 'gpt-5.6-luna' : 'claude-sonnet-5'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.emptySlice).toBe(true)
      expect(result.continued).toBe(true)
    }
    expect(createdSession).toBe(true)
    expect(resumeCalls).toBe(1)
    expect(events.filter((e) => (e as { kind?: string }).kind === 'compacted')).toHaveLength(0)
    const stopped = JSON.parse(await fs.readFile(stoppedPath, 'utf8')) as {
      harness: string
      sessionId: string
    }
    expect(stopped.harness).toBe('codex')
    expect(stopped.sessionId).toBe('codex-new')
  })

  it('paused without stopped-turn goes idle with no turn', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-sw3-'))
    let resumeCalls = 0
    let state = 'paused'
    const result = await switchHarness({
      agent: agent(),
      toHarness: 'codex',
      state: 'paused',
      turns: [],
      sessions: {
        'claude-code': null,
        codex: null,
        lastInjectedSeq: { 'claude-code': 0, codex: 0 },
      },
      privateDir: dir,
      loadCompactPrompt: () => 'p',
      runCompact: async () => ({ ok: true, text: 'b' }),
      runInject: async () => ({ ok: true, sessionId: 'x' }),
      createDestinationSession: async () => 's',
      persistSessions: async () => {},
      persistAgentHarness: async (h, model) => agent({ harness: h, model }),
      pushHarness: () => {},
      pushTurnCreated: () => {},
      startResumeContinue: async () => {
        resumeCalls += 1
      },
      setRuntimeState: (s) => {
        state = s
      },
      defaultModelFor: () => 'gpt-5.6-luna',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.continued).toBe(false)
    expect(resumeCalls).toBe(0)
    expect(state).toBe('idle')
  })

  it('non-empty slice emits harness-switch compacted; compact-failed rolls back', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-sw4-'))
    const sessions: SessionsFile = {
      'claude-code': 'c1',
      codex: 'x1',
      lastInjectedSeq: { 'claude-code': 0, codex: 0 },
    }
    const events: Array<{ kind?: string; reason?: string }> = []
    const turns = [
      turn({ seq: 1, role: 'user', parts: [{ type: 'text', id: 'a', text: 'do it' }] }),
      turn({ seq: 2, role: 'assistant', parts: [{ type: 'text', id: 'b', text: 'working' }] }),
    ]
    let state = 'idle'
    const ok = await switchHarness({
      agent: agent(),
      toHarness: 'codex',
      state: 'idle',
      turns,
      sessions,
      privateDir: dir,
      loadCompactPrompt: () => 'summarize',
      runCompact: async () => ({ ok: true, text: 'briefing' }),
      runInject: async () => ({ ok: true, sessionId: 'x1' }),
      createDestinationSession: async () => 'x1',
      persistSessions: async () => {},
      persistAgentHarness: async (h, model) => agent({ harness: h, model }),
      pushHarness: (_id, ev) => events.push(ev as never),
      pushTurnCreated: (t) => {
        expect(t.source).toBe('harness-switch-compact')
        events.push({ kind: 'turn-created' })
      },
      startResumeContinue: async () => {},
      setRuntimeState: (s) => {
        state = s
      },
      defaultModelFor: () => 'gpt-5.6-luna',
    })
    expect(ok.ok).toBe(true)
    expect(events.some((e) => e.kind === 'compacted' && e.reason === 'harness-switch')).toBe(true)

    state = 'paused'
    const fail = await switchHarness({
      agent: agent(),
      toHarness: 'codex',
      state: 'paused',
      turns,
      sessions: {
        'claude-code': 'c1',
        codex: null,
        lastInjectedSeq: { 'claude-code': 0, codex: 0 },
      },
      privateDir: dir,
      loadCompactPrompt: () => 'p',
      runCompact: async () => ({ ok: false, error: 'boom' }),
      runInject: async () => ({ ok: true, sessionId: 'x' }),
      createDestinationSession: async () => 'x',
      persistSessions: async () => {},
      persistAgentHarness: async (h, model) => agent({ harness: h, model }),
      pushHarness: () => {},
      pushTurnCreated: () => {},
      startResumeContinue: async () => {},
      setRuntimeState: (s) => {
        state = s
      },
      defaultModelFor: () => 'gpt-5.6-luna',
    })
    expect(fail).toEqual({ ok: false, error: 'compact-failed' })
    expect(state).toBe('paused')
  })

  it('busy while thinking', async () => {
    const r = await switchHarness({
      agent: agent(),
      toHarness: 'codex',
      state: 'thinking',
      turns: [],
      sessions: {
        'claude-code': null,
        codex: null,
        lastInjectedSeq: { 'claude-code': 0, codex: 0 },
      },
      privateDir: os.tmpdir(),
      loadCompactPrompt: () => '',
      runCompact: async () => ({ ok: true, text: '' }),
      runInject: async () => ({ ok: true, sessionId: 'x' }),
      createDestinationSession: async () => 'x',
      persistSessions: async () => {},
      persistAgentHarness: async (h, model) => agent({ harness: h, model }),
      pushHarness: () => {},
      pushTurnCreated: () => {},
      startResumeContinue: async () => {},
      setRuntimeState: () => {},
      defaultModelFor: () => 'gpt-5.6-luna',
    })
    expect(r).toEqual({ ok: false, error: 'busy' })
  })
})
