import { describe, expect, it } from 'vitest'
import * as Protocol from '../src/index'
import {
  AgentConfigSchema,
  AgentContextSchema,
  AgentRuntimeSchema,
  AgentStateSchema,
  BannerSchema,
  DaemonEventSchema,
  EventStreamMetaSchema,
  EventStreamRequestSchema,
  HarnessCompleteLoginRequestSchema,
  HarnessCompleteLoginResponseSchema,
  HarnessEventSchema,
  HarnessStartLoginRequestSchema,
  HarnessStartLoginResponseSchema,
  HealthReportSchema,
  StreamEnvelopeSchema,
  TurnPartSchema,
  TurnSchema,
  TurnSourceSchema,
  AgentCreateRequestSchema,
  AgentCreateResponseSchema,
  AgentDeleteRequestSchema,
  AgentDeleteResponseSchema,
  AgentListRequestSchema,
  AgentListResponseSchema,
  AgentGetRequestSchema,
  AgentGetResponseSchema,
  AgentFilesRequestSchema,
  AgentFilesResponseSchema,
  AgentReadFileRequestSchema,
  AgentReadFileResponseSchema,
  AgentSetModelRequestSchema,
  AgentSetModelResponseSchema,
  AgentModelsRequestSchema,
  AgentModelsResponseSchema,
  AgentCompactRequestSchema,
  AgentCompactResponseSchema,
  AgentClearRequestSchema,
  AgentClearResponseSchema,
  AgentSetFastRequestSchema,
  AgentSetFastResponseSchema,
  AgentSkillsRequestSchema,
  AgentSkillsResponseSchema,
  AgentRenameRequestSchema,
  AgentRenameResponseSchema,
  AgentSetHarnessRequestSchema,
  AgentSetHarnessResponseSchema,
  AgentPauseRequestSchema,
  AgentPauseResponseSchema,
  AgentResumeRequestSchema,
  AgentResumeResponseSchema,
  ChatSendRequestSchema,
  ChatSendResponseSchema,
  ChatHistoryRequestSchema,
  ChatHistoryResponseSchema,
  ChatStopRequestSchema,
  ChatStopResponseSchema,
  AskAnswerRequestSchema,
  AskAnswerResponseSchema,
  BrowserExecRequestSchema,
  BrowserExecResponseSchema,
  BrowserAllowSiteRequestSchema,
  BrowserAllowSiteResponseSchema,
  BrowserSetHumanControlRequestSchema,
  BrowserSetHumanControlResponseSchema,
  TerminalReadRequestSchema,
  TerminalReadResponseSchema,
  TerminalRunRequestSchema,
  TerminalRunResponseSchema,
} from '../src/index'

function expectReject(schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) {
  expect(schema.safeParse(value).success).toBe(false)
}

const harnessAuth = { 'claude-code': 'logged-out' as const, codex: 'logged-out' as const }

const validAgent = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Research',
  slug: 'research',
  harness: 'claude-code' as const,
  model: 'claude-sonnet-5',
  memoryBankId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-08-14T00:00:00.000Z',
}

const validRuntime = {
  agentId: validAgent.id,
  state: 'idle' as const,
  queueCount: 0,
  spendUsdToday: 0,
  harnessAuth,
  humanControl: { held: false },
  talkingToAgentId: null as string | null,
  contextUsed: null as number | null,
  contextWindow: null as number | null,
  sessionId: null as string | null,
  mcp: [] as Array<{ name: 'openbot' | 'hindsight'; url: string; last: 'ok' | 'fail' | null }>,
}

describe('AgentConfigSchema', () => {
  it('parses a valid config with model + memoryBankId', () => {
    expect(AgentConfigSchema.parse(validAgent)).toEqual(validAgent)
  })

  it('accepts optional effort and fast', () => {
    const withOpts = { ...validAgent, effort: 'high', fast: true }
    expect(AgentConfigSchema.parse(withOpts)).toEqual(withOpts)
  })

  it('rejects roleMd', () => {
    expectReject(AgentConfigSchema, { ...validAgent, roleMd: '# role' })
  })

  it('rejects plan', () => {
    expectReject(AgentConfigSchema, { ...validAgent, plan: true })
  })

  it('rejects missing model', () => {
    const { model: _m, ...rest } = validAgent
    expectReject(AgentConfigSchema, rest)
  })

  it('rejects missing memoryBankId', () => {
    const { memoryBankId: _m, ...rest } = validAgent
    expectReject(AgentConfigSchema, rest)
  })

  it('rejects exitNodeEnabled / memoryLimitMb / cpus', () => {
    expectReject(AgentConfigSchema, { ...validAgent, exitNodeEnabled: true })
    expectReject(AgentConfigSchema, { ...validAgent, memoryLimitMb: 512 })
    expectReject(AgentConfigSchema, { ...validAgent, cpus: 2 })
  })

  it('rejects invalid slug', () => {
    expectReject(AgentConfigSchema, { ...validAgent, slug: 'Bad_Slug' })
    expectReject(AgentConfigSchema, { ...validAgent, slug: '-leading' })
  })

  it('accepts single-char and max-length slug', () => {
    expect(AgentConfigSchema.parse({ ...validAgent, slug: 'a' }).slug).toBe('a')
    const max = 'a' + 'b'.repeat(46) + 'c'
    expect(max).toHaveLength(48)
    expect(AgentConfigSchema.parse({ ...validAgent, slug: max }).slug).toBe(max)
  })

  it('round-trips', () => {
    const parsed = AgentConfigSchema.parse(validAgent)
    expect(AgentConfigSchema.parse(parsed)).toEqual(parsed)
  })
})

describe('AgentStateSchema', () => {
  it('includes needs-you and rejects waiting-intervention', () => {
    expect(AgentStateSchema.parse('needs-you')).toBe('needs-you')
    expectReject(AgentStateSchema, 'waiting-intervention')
  })
})

describe('AgentRuntimeSchema', () => {
  it('parses a valid runtime', () => {
    expect(AgentRuntimeSchema.parse(validRuntime)).toEqual(validRuntime)
  })

  it('accepts talkingToAgentId null and string', () => {
    expect(AgentRuntimeSchema.parse({ ...validRuntime, talkingToAgentId: null }).talkingToAgentId).toBeNull()
    expect(
      AgentRuntimeSchema.parse({ ...validRuntime, talkingToAgentId: 'peer-1' }).talkingToAgentId,
    ).toBe('peer-1')
  })

  it('accepts contextUsed / contextWindow / sessionId nulls', () => {
    const r = AgentRuntimeSchema.parse({
      ...validRuntime,
      contextUsed: 100,
      contextWindow: 200000,
      sessionId: 'sess',
    })
    expect(r.contextUsed).toBe(100)
    expect(r.contextWindow).toBe(200000)
    expect(r.sessionId).toBe('sess')
  })

  it('accepts mcp entries', () => {
    const r = AgentRuntimeSchema.parse({
      ...validRuntime,
      mcp: [
        { name: 'openbot', url: 'http://127.0.0.1:8799/mcp/a', last: null },
        { name: 'hindsight', url: 'http://127.0.0.1:8888/mcp/b/', last: 'ok' },
      ],
    })
    expect(r.mcp).toHaveLength(2)
  })

  it('rejects tailnetDns / trustLabel / leaseExpiresAt', () => {
    expectReject(AgentRuntimeSchema, { ...validRuntime, tailnetDns: 'x' })
    expectReject(AgentRuntimeSchema, { ...validRuntime, trustLabel: 'container-bypass' })
    expectReject(AgentRuntimeSchema, {
      ...validRuntime,
      humanControl: { held: false, leaseExpiresAt: null },
    })
  })

  it('rejects botId key', () => {
    const { agentId: _a, ...rest } = validRuntime
    expectReject(AgentRuntimeSchema, { ...rest, botId: 'bot-1' })
  })
})

describe('AgentContextSchema', () => {
  const valid = {
    agentId: validAgent.id,
    workspaceDir: '/Users/a/.openbot/agents/research/workspace',
    dataDir: '/Users/a/.openbot',
    sessionId: null as string | null,
  }

  it('parses with sessionId and no Docker paths', () => {
    expect(AgentContextSchema.parse(valid)).toEqual(valid)
    expect(
      AgentContextSchema.parse({
        ...valid,
        sessionId: 's1',
        inFlightPid: 1,
        loginPid: 2,
      }),
    ).toMatchObject({ sessionId: 's1', inFlightPid: 1, loginPid: 2 })
  })

  it('rejects Docker fields', () => {
    expectReject(AgentContextSchema, { ...valid, containerName: 'x' })
    expectReject(AgentContextSchema, { ...valid, workspace: '/workspace' })
    expectReject(AgentContextSchema, { ...valid, botDir: '/bot' })
    expectReject(AgentContextSchema, { ...valid, lastAutoCompactAt: null })
  })
})

describe('HealthReportSchema', () => {
  it('parses without cliVersion', () => {
    const valid = { ok: true, harnessAuth }
    expect(HealthReportSchema.parse(valid)).toEqual(valid)
  })

  it('rejects cliVersion', () => {
    expectReject(HealthReportSchema, { ok: true, harnessAuth, cliVersion: '1.0.0' })
  })
})

describe('TurnPartSchema', () => {
  it('parses peer-message with text and rejects summary', () => {
    const part = {
      type: 'peer-message' as const,
      id: 'p1',
      peerAgentId: 'a2',
      peerName: 'Bea',
      direction: 'sent' as const,
      text: 'full body',
    }
    expect(TurnPartSchema.parse(part)).toEqual(part)
    expectReject(TurnPartSchema, { ...part, summary: 'short' })
  })

  it('parses ask-user-question statuses and rejects a fourth', () => {
    const base = {
      type: 'ask-user-question' as const,
      id: 'q1',
      questions: [
        {
          question: 'Ship today?',
          header: 'Ship',
          options: [{ label: 'Today', description: 'now' }],
          multiSelect: false,
        },
      ],
      status: 'open' as const,
    }
    for (const status of ['open', 'answered', 'cancelled'] as const) {
      expect(TurnPartSchema.parse({ ...base, status })).toMatchObject({ status })
    }
    expectReject(TurnPartSchema, { ...base, status: 'pending' })
    expect(
      TurnPartSchema.parse({
        ...base,
        status: 'answered',
        answers: { 'Ship today?': 'Today' },
        response: 'typed',
      }),
    ).toMatchObject({ answers: { 'Ship today?': 'Today' }, response: 'typed' })
  })

  it('parses compaction reasons and optional forHarness; rejects auto and outcome part', () => {
    expect(
      TurnPartSchema.parse({
        type: 'compaction',
        id: 'c1',
        reason: 'manual',
        forHarness: 'claude-code',
      }),
    ).toMatchObject({ reason: 'manual' })
    expect(
      TurnPartSchema.parse({ type: 'compaction', id: 'c2', reason: 'clear' }),
    ).toMatchObject({ reason: 'clear' })
    expectReject(TurnPartSchema, {
      type: 'compaction',
      id: 'c3',
      reason: 'auto',
      forHarness: 'claude-code',
    })
    expectReject(TurnPartSchema, {
      type: 'outcome',
      id: 'o1',
      outcome: 'interrupted',
      message: 'stopped',
    })
  })

  it('parses text / reasoning / tool parts', () => {
    expect(TurnPartSchema.parse({ type: 'text', id: 't1', text: 'hi' })).toEqual({
      type: 'text',
      id: 't1',
      text: 'hi',
    })
  })
})

describe('TurnSourceSchema + TurnSchema', () => {
  const valid = {
    id: 'turn-1',
    seq: 1,
    agentId: validAgent.id,
    role: 'user' as const,
    source: 'user' as const,
    parts: [{ type: 'text' as const, id: 't1', text: 'hi' }],
    createdAt: '2026-08-14T00:00:00.000Z',
  }

  it('accepts clear and resume-continue; rejects routine', () => {
    expect(TurnSourceSchema.parse('clear')).toBe('clear')
    expect(TurnSourceSchema.parse('resume-continue')).toBe('resume-continue')
    expect(TurnSourceSchema.parse('peer')).toBe('peer')
    expectReject(TurnSourceSchema, 'routine')
  })

  it('parses turn with agentId not botId', () => {
    expect(TurnSchema.parse(valid)).toEqual(valid)
    expectReject(TurnSchema, { ...valid, botId: 'bot-1', agentId: undefined })
  })
})

describe('HarnessEventSchema', () => {
  it('parses peer-message / ask-user-question / ask-user-question-status / turn-created', () => {
    expect(
      HarnessEventSchema.parse({
        kind: 'peer-message',
        partId: 'p1',
        peerAgentId: 'a2',
        peerName: 'Bea',
        direction: 'received',
        text: 'hello',
      }),
    ).toMatchObject({ kind: 'peer-message' })
    expect(
      HarnessEventSchema.parse({
        kind: 'ask-user-question',
        partId: 'q1',
        questions: [
          {
            question: 'Ship?',
            header: 'Ship',
            options: [{ label: 'Today', description: 'now' }],
            multiSelect: false,
          },
        ],
        status: 'open',
      }),
    ).toMatchObject({ kind: 'ask-user-question' })
    expect(
      HarnessEventSchema.parse({
        kind: 'ask-user-question-status',
        partId: 'q1',
        status: 'answered',
      }),
    ).toMatchObject({ status: 'answered' })
    expect(
      HarnessEventSchema.parse({
        kind: 'turn-created',
        turnId: 't1',
        seq: 1,
        role: 'user',
        source: 'user',
        createdAt: '2026-08-14T00:00:00.000Z',
      }),
    ).toMatchObject({ kind: 'turn-created' })
    expectReject(HarnessEventSchema, {
      kind: 'turn-created',
      turnId: 't1',
      seq: 1,
      role: 'user',
      source: 'user',
    })
  })

  it('compacted requires partId; reason harness-switch|manual|clear; rejects auto; forHarness optional', () => {
    expect(
      HarnessEventSchema.parse({
        kind: 'compacted',
        partId: 'cp1',
        reason: 'manual',
        forHarness: 'claude-code',
      }),
    ).toMatchObject({ partId: 'cp1', reason: 'manual' })
    expect(
      HarnessEventSchema.parse({ kind: 'compacted', partId: 'cp2', reason: 'clear' }),
    ).toMatchObject({ reason: 'clear' })
    expectReject(HarnessEventSchema, {
      kind: 'compacted',
      partId: 'cp3',
      reason: 'auto',
    })
    expectReject(HarnessEventSchema, {
      kind: 'compacted',
      reason: 'manual',
      forHarness: 'claude-code',
    })
  })

  it('turn-finished requires outcome and usage.costUsd (nullable); usage always strict', () => {
    expect(
      HarnessEventSchema.parse({
        kind: 'turn-finished',
        sessionId: 's1',
        outcome: 'complete',
        usage: { costUsd: null },
      }),
    ).toMatchObject({ outcome: 'complete', usage: { costUsd: null } })
    expect(
      HarnessEventSchema.parse({
        kind: 'turn-finished',
        sessionId: 's1',
        outcome: 'error',
        errorMessage: 'boom',
        usage: { costUsd: 0.01, inputTokens: 1, outputTokens: 2, contextWindow: 3 },
      }),
    ).toMatchObject({ outcome: 'error', errorMessage: 'boom' })
    expectReject(HarnessEventSchema, {
      kind: 'turn-finished',
      sessionId: 's1',
      usage: { costUsd: 0.01 },
    })
    expectReject(HarnessEventSchema, {
      kind: 'turn-finished',
      sessionId: 's1',
      outcome: 'complete',
    })
    expectReject(HarnessEventSchema, {
      kind: 'turn-finished',
      sessionId: 's1',
      outcome: 'complete',
      usage: {},
    })
    expectReject(HarnessEventSchema, {
      kind: 'turn-finished',
      sessionId: 's1',
      outcome: 'complete',
      usage: { costUsd: 1, unknownKey: 1 },
    })
  })

  it('rejects exit-node-offline error code', () => {
    expectReject(HarnessEventSchema, {
      kind: 'error',
      message: 'x',
      fatal: true,
      code: 'exit-node-offline',
    })
    expect(
      HarnessEventSchema.parse({
        kind: 'error',
        message: 'x',
        fatal: true,
        code: 'cli-fatal',
      }),
    ).toMatchObject({ code: 'cli-fatal' })
  })
})

describe('BannerSchema + DaemonEventSchema', () => {
  it('exports BannerSchema and accepts needs-login / disk-warn / needs-site / memory-error', () => {
    expect(BannerSchema).toBeDefined()
    const needsLogin = {
      kind: 'banner' as const,
      bannerId: 'b1',
      agentId: validAgent.id,
      type: 'needs-login' as const,
      harness: 'claude-code' as const,
      message: 'Sign in',
      actions: ['log-in' as const],
    }
    expect(BannerSchema.parse(needsLogin)).toEqual(needsLogin)
    expect(
      BannerSchema.parse({
        kind: 'banner',
        bannerId: 'b2',
        agentId: validAgent.id,
        type: 'disk-warn',
        message: 'low',
        actions: ['dismiss'],
      }),
    ).toMatchObject({ type: 'disk-warn' })
    expect(
      BannerSchema.parse({
        kind: 'banner',
        bannerId: 'b3',
        agentId: validAgent.id,
        type: 'needs-site',
        host: 'example.com',
        message: 'Allow example.com?',
        actions: ['allow-site', 'deny-site'],
      }),
    ).toMatchObject({ type: 'needs-site', host: 'example.com' })
    expect(
      BannerSchema.parse({
        kind: 'banner',
        bannerId: 'b4',
        agentId: validAgent.id,
        type: 'memory-error',
        message: 'memory down',
        actions: ['retry-memory', 'dismiss'],
      }),
    ).toMatchObject({ type: 'memory-error' })
  })

  it('rejects peer-rate-limit and exit-node-offline banners; rejects take-over / disable-exit-node actions', () => {
    expectReject(BannerSchema, {
      kind: 'banner',
      bannerId: 'b1',
      agentId: validAgent.id,
      type: 'peer-rate-limit',
      message: 'x',
      actions: ['dismiss'],
    })
    expectReject(BannerSchema, {
      kind: 'banner',
      bannerId: 'b1',
      agentId: validAgent.id,
      type: 'exit-node-offline',
      message: 'x',
      actions: ['disable-exit-node'],
    })
    expectReject(BannerSchema, {
      kind: 'banner',
      bannerId: 'b1',
      agentId: validAgent.id,
      type: 'needs-login',
      harness: 'claude-code',
      message: 'x',
      actions: ['take-over'],
    })
  })

  it('uses kind agent-runtime and rejects bot-runtime / interventions', () => {
    expect(
      DaemonEventSchema.parse({ kind: 'agent-runtime', runtime: validRuntime }),
    ).toMatchObject({ kind: 'agent-runtime' })
    expectReject(DaemonEventSchema, { kind: 'bot-runtime', runtime: validRuntime })
    expectReject(DaemonEventSchema, {
      kind: 'intervention-opened',
      intervention: {
        id: 'i1',
        botId: 'b',
        title: 't',
        instructions: 'i',
        status: 'open',
        createdAt: '2026-08-14T00:00:00.000Z',
      },
    })
  })
})

describe('StreamEnvelopeSchema + EventStreamMeta', () => {
  it('uses agentId and rejects botId / channel meta', () => {
    const harness = {
      id: 1,
      agentId: validAgent.id,
      channel: 'harness' as const,
      turnId: 't1',
      event: { kind: 'turn-started' as const, sessionId: 's1' },
    }
    expect(StreamEnvelopeSchema.parse(harness)).toEqual(harness)
    expectReject(StreamEnvelopeSchema, { ...harness, botId: 'bot-1', agentId: undefined })
    expectReject(StreamEnvelopeSchema, {
      id: 3,
      agentId: validAgent.id,
      channel: 'meta',
      event: { type: 'event.stream.meta', replayReset: true },
    })
  })

  it('EventStreamMetaSchema accepts replayReset true', () => {
    const meta = { type: 'event.stream.meta' as const, replayReset: true as const }
    expect(EventStreamMetaSchema.parse(meta)).toEqual(meta)
    expect(EventStreamRequestSchema.parse({ type: 'event.stream' })).toEqual({ type: 'event.stream' })
  })
})

describe('remote leftovers gone', () => {
  it('does not export interventions, routines, exit-node, or old human-control RPCs', () => {
    expect((Protocol as Record<string, unknown>).InterventionSchema).toBeUndefined()
    expect((Protocol as Record<string, unknown>).RoutineSchema).toBeUndefined()
    expect((Protocol as Record<string, unknown>).BotSetExitNodeRequestSchema).toBeUndefined()
    expect((Protocol as Record<string, unknown>).BotSetHumanControlRequestSchema).toBeUndefined()
    expect((Protocol as Record<string, unknown>).AgentSetPlanRequestSchema).toBeUndefined()
  })
})

describe('agent.create', () => {
  it('accepts name-only, description-only, and both', () => {
    expect(AgentCreateRequestSchema.parse({ type: 'agent.create', name: 'Ada' })).toEqual({
      type: 'agent.create',
      name: 'Ada',
    })
    expect(
      AgentCreateRequestSchema.parse({ type: 'agent.create', description: 'does research' }),
    ).toMatchObject({ description: 'does research' })
    expect(
      AgentCreateRequestSchema.parse({
        type: 'agent.create',
        name: 'Ada',
        description: 'does research',
      }),
    ).toMatchObject({ name: 'Ada', description: 'does research' })
  })

  it('response ok with agent; fail need-name-or-description', () => {
    expect(
      AgentCreateResponseSchema.parse({ ok: true, agent: validAgent }),
    ).toMatchObject({ ok: true })
    expect(
      AgentCreateResponseSchema.parse({ ok: false, error: 'need-name-or-description' }),
    ).toEqual({ ok: false, error: 'need-name-or-description' })
    expect(
      AgentCreateResponseSchema.parse({ ok: false, error: 'invalid-name' }),
    ).toMatchObject({ error: 'invalid-name' })
    expect(
      AgentCreateResponseSchema.parse({ ok: false, error: 'slug-taken' }),
    ).toMatchObject({ error: 'slug-taken' })
  })
})

describe('agent.list / agent.get / agent.delete / agent.files / agent.readFile', () => {
  it('agent.list items are { agent, runtime, banners } strict', () => {
    expect(AgentListRequestSchema.parse({ type: 'agent.list' })).toEqual({ type: 'agent.list' })
    const ok = {
      ok: true as const,
      agents: [{ agent: validAgent, runtime: validRuntime, banners: [] as [] }],
    }
    expect(AgentListResponseSchema.parse(ok)).toEqual(ok)
    expectReject(AgentListResponseSchema, {
      ok: true,
      agents: [{ agent: validAgent, runtime: validRuntime }],
    })
    expectReject(AgentListResponseSchema, {
      ok: true,
      agents: [{ agent: validAgent, runtime: validRuntime, banners: [], extra: 1 }],
    })
  })

  it('agent.get uses agent + banners; rejects config', () => {
    expect(AgentGetRequestSchema.parse({ type: 'agent.get', agentId: validAgent.id })).toEqual({
      type: 'agent.get',
      agentId: validAgent.id,
    })
    const ok = {
      ok: true as const,
      agent: validAgent,
      runtime: validRuntime,
      banners: [] as [],
    }
    expect(AgentGetResponseSchema.parse(ok)).toEqual(ok)
    expectReject(AgentGetResponseSchema, {
      ok: true,
      config: validAgent,
      runtime: validRuntime,
      banners: [],
    })
    expect(
      AgentGetResponseSchema.parse({ ok: false, error: 'agent-not-found' }),
    ).toEqual({ ok: false, error: 'agent-not-found' })
  })

  it('agent.delete / files / readFile', () => {
    expect(AgentDeleteRequestSchema.parse({ type: 'agent.delete', agentId: validAgent.id })).toEqual({
      type: 'agent.delete',
      agentId: validAgent.id,
    })
    expect(AgentDeleteResponseSchema.parse({ ok: true })).toEqual({ ok: true })
    expect(
      AgentDeleteResponseSchema.parse({ ok: false, error: 'memory-delete-failed' }),
    ).toMatchObject({ error: 'memory-delete-failed' })

    expect(AgentFilesRequestSchema.parse({ type: 'agent.files', agentId: validAgent.id })).toEqual({
      type: 'agent.files',
      agentId: validAgent.id,
    })
    expect(
      AgentFilesResponseSchema.parse({ ok: true, files: ['role.md', 'MEMORY.md'] }),
    ).toMatchObject({ files: ['role.md', 'MEMORY.md'] })

    expect(
      AgentReadFileRequestSchema.parse({
        type: 'agent.readFile',
        agentId: validAgent.id,
        path: 'role.md',
      }),
    ).toMatchObject({ path: 'role.md' })
    expect(
      AgentReadFileResponseSchema.parse({ ok: true, text: 'You are Ada.' }),
    ).toMatchObject({ text: 'You are Ada.' })
    expect(
      AgentReadFileResponseSchema.parse({ ok: false, error: 'forbidden' }),
    ).toMatchObject({ error: 'forbidden' })
  })
})

describe('agent.setModel / agent.models / slash messages', () => {
  it('agent.setModel requires model; effort optional; errors busy|invalid-model|agent-not-found', () => {
    expect(
      AgentSetModelRequestSchema.parse({
        type: 'agent.setModel',
        agentId: validAgent.id,
        model: 'claude-sonnet-5',
      }),
    ).toMatchObject({ model: 'claude-sonnet-5' })
    expect(
      AgentSetModelRequestSchema.parse({
        type: 'agent.setModel',
        agentId: validAgent.id,
        model: 'claude-sonnet-5',
        effort: 'high',
      }),
    ).toMatchObject({ effort: 'high' })
    expectReject(AgentSetModelRequestSchema, {
      type: 'agent.setModel',
      agentId: validAgent.id,
    })
    for (const error of ['busy', 'invalid-model', 'agent-not-found'] as const) {
      expect(AgentSetModelResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
    expect(
      AgentSetModelResponseSchema.parse({ ok: true, agent: validAgent }),
    ).toMatchObject({ ok: true })
  })

  it('agent.models returns catalog shape', () => {
    expect(AgentModelsRequestSchema.parse({ type: 'agent.models', agentId: validAgent.id })).toEqual({
      type: 'agent.models',
      agentId: validAgent.id,
    })
    expect(
      AgentModelsResponseSchema.parse({
        ok: true,
        models: [{ id: 'claude-sonnet-5', displayName: 'Sonnet 5', efforts: ['low', 'max'] }],
      }),
    ).toMatchObject({ ok: true })
    expect(
      AgentModelsResponseSchema.parse({ ok: false, error: 'agent-not-found' }),
    ).toEqual({ ok: false, error: 'agent-not-found' })
  })

  it('agent.compact / clear / setFast / skills / rename', () => {
    expect(AgentCompactRequestSchema.parse({ type: 'agent.compact', agentId: validAgent.id })).toEqual({
      type: 'agent.compact',
      agentId: validAgent.id,
    })
    for (const error of ['busy', 'agent-not-found', 'needs-login'] as const) {
      expect(AgentCompactResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
    expect(AgentClearRequestSchema.parse({ type: 'agent.clear', agentId: validAgent.id })).toEqual({
      type: 'agent.clear',
      agentId: validAgent.id,
    })
    for (const error of ['busy', 'agent-not-found'] as const) {
      expect(AgentClearResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
    expect(
      AgentSetFastRequestSchema.parse({ type: 'agent.setFast', agentId: validAgent.id, fast: true }),
    ).toMatchObject({ fast: true })
    expect(
      AgentSetFastResponseSchema.parse({ ok: true, agent: { ...validAgent, fast: true } }),
    ).toMatchObject({ ok: true })
    expect(AgentSkillsRequestSchema.parse({ type: 'agent.skills', agentId: validAgent.id })).toEqual({
      type: 'agent.skills',
      agentId: validAgent.id,
    })
    expect(
      AgentSkillsResponseSchema.parse({
        ok: true,
        skills: [{ name: 'draft', body: 'Draft it.' }],
      }),
    ).toMatchObject({ skills: [{ name: 'draft', body: 'Draft it.' }] })
    expect(
      AgentRenameRequestSchema.parse({
        type: 'agent.rename',
        agentId: validAgent.id,
        name: 'Ada',
      }),
    ).toMatchObject({ name: 'Ada' })
    expect(
      AgentRenameResponseSchema.parse({ ok: false, error: 'invalid-name' }),
    ).toEqual({ ok: false, error: 'invalid-name' })
  })
})

describe('agent.setHarness / pause / resume', () => {
  it('setHarness errors busy|compact-failed|inject-failed|needs-login|agent-not-found; rejects harness-switch-busy and bot-not-found', () => {
    expect(
      AgentSetHarnessRequestSchema.parse({
        type: 'agent.setHarness',
        agentId: validAgent.id,
        harness: 'codex',
      }),
    ).toMatchObject({ type: 'agent.setHarness', agentId: validAgent.id })
    for (const error of [
      'busy',
      'compact-failed',
      'inject-failed',
      'needs-login',
      'agent-not-found',
    ] as const) {
      expect(AgentSetHarnessResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
    expectReject(AgentSetHarnessResponseSchema, { ok: false, error: 'harness-switch-busy' })
    expectReject(AgentSetHarnessResponseSchema, { ok: false, error: 'bot-not-found' })
  })

  it('pause / resume use agentId and agent-not-found', () => {
    expect(AgentPauseRequestSchema.parse({ type: 'agent.pause', agentId: validAgent.id })).toEqual({
      type: 'agent.pause',
      agentId: validAgent.id,
    })
    expect(AgentResumeRequestSchema.parse({ type: 'agent.resume', agentId: validAgent.id })).toEqual({
      type: 'agent.resume',
      agentId: validAgent.id,
    })
    expect(AgentPauseResponseSchema.parse({ ok: false, error: 'agent-not-found' })).toEqual({
      ok: false,
      error: 'agent-not-found',
    })
    expectReject(AgentPauseResponseSchema, { ok: false, error: 'bot-not-found' })
  })
})

describe('chat.send / chat.history / chat.stop / ask.answer', () => {
  it('chat.send includes text-empty', () => {
    expect(
      ChatSendRequestSchema.parse({ type: 'chat.send', agentId: validAgent.id, text: 'hi' }),
    ).toMatchObject({ text: 'hi' })
    expect(ChatSendResponseSchema.parse({ ok: true, turnId: 't1' })).toEqual({
      ok: true,
      turnId: 't1',
    })
    for (const error of ['agent-not-found', 'paused', 'needs-login', 'text-empty'] as const) {
      expect(ChatSendResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
  })

  it('chat.history has optional limit and required lastEnvelopeId', () => {
    expect(
      ChatHistoryRequestSchema.parse({ type: 'chat.history', agentId: validAgent.id }),
    ).toMatchObject({ type: 'chat.history' })
    expect(
      ChatHistoryRequestSchema.parse({
        type: 'chat.history',
        agentId: validAgent.id,
        sinceSeq: 1,
        limit: 50,
      }),
    ).toMatchObject({ limit: 50 })
    const turn = {
      id: 'turn-1',
      seq: 1,
      agentId: validAgent.id,
      role: 'user' as const,
      source: 'user' as const,
      parts: [{ type: 'text' as const, id: 't1', text: 'hi' }],
      createdAt: '2026-08-14T00:00:00.000Z',
    }
    expect(
      ChatHistoryResponseSchema.parse({ ok: true, turns: [turn], lastEnvelopeId: 9 }),
    ).toMatchObject({ lastEnvelopeId: 9 })
    expectReject(ChatHistoryResponseSchema, { ok: true, turns: [turn] })
  })

  it('chat.stop uses agentId and agent-not-found; rejects bot-not-found', () => {
    expect(ChatStopRequestSchema.parse({ type: 'chat.stop', agentId: validAgent.id })).toEqual({
      type: 'chat.stop',
      agentId: validAgent.id,
    })
    expectReject(ChatStopRequestSchema, { type: 'chat.stop', botId: validAgent.id })
    expect(ChatStopResponseSchema.parse({ ok: false, error: 'agent-not-found' })).toEqual({
      ok: false,
      error: 'agent-not-found',
    })
    expectReject(ChatStopResponseSchema, { ok: false, error: 'bot-not-found' })
  })

  it('ask.answer', () => {
    expect(
      AskAnswerRequestSchema.parse({
        type: 'ask.answer',
        agentId: validAgent.id,
        partId: 'q1',
        answers: { 'Ship?': 'Today' },
      }),
    ).toMatchObject({ partId: 'q1' })
    expect(
      AskAnswerRequestSchema.parse({
        type: 'ask.answer',
        agentId: validAgent.id,
        partId: 'q1',
        answers: {},
        response: 'typed',
      }),
    ).toMatchObject({ response: 'typed' })
    expect(AskAnswerResponseSchema.parse({ ok: true })).toEqual({ ok: true })
    expect(AskAnswerResponseSchema.parse({ ok: false, error: 'not-open' })).toEqual({
      ok: false,
      error: 'not-open',
    })
  })
})

describe('browser + terminal messages', () => {
  it('browser.exec all five ops', () => {
    const base = {
      type: 'browser.exec' as const,
      agentId: validAgent.id,
      allowedHosts: ['example.com'],
    }
    expect(BrowserExecRequestSchema.parse({ ...base, op: 'navigate', url: 'https://example.com' })).toMatchObject({
      op: 'navigate',
    })
    expect(BrowserExecRequestSchema.parse({ ...base, op: 'snapshot' })).toMatchObject({ op: 'snapshot' })
    expect(BrowserExecRequestSchema.parse({ ...base, op: 'click', ref: 'e1' })).toMatchObject({
      op: 'click',
    })
    expect(
      BrowserExecRequestSchema.parse({ ...base, op: 'type', ref: 'e1', text: 'hi' }),
    ).toMatchObject({ op: 'type' })
    expect(BrowserExecRequestSchema.parse({ ...base, op: 'screenshot' })).toMatchObject({
      op: 'screenshot',
    })
  })

  it('browser.exec response errors include cross-site url+host, nav-failed, op-failed; rejects needs-site', () => {
    expect(
      BrowserExecResponseSchema.parse({
        ok: true,
        result: { url: 'https://example.com', title: 'Example' },
      }),
    ).toMatchObject({ ok: true })
    expect(
      BrowserExecResponseSchema.parse({
        ok: false,
        error: 'cross-site',
        url: 'https://evil.com',
        host: 'evil.com',
      }),
    ).toMatchObject({ error: 'cross-site', url: 'https://evil.com', host: 'evil.com' })
    expect(
      BrowserExecResponseSchema.parse({
        ok: false,
        error: 'nav-failed',
        errorCode: -2,
        errorDescription: 'failed',
      }),
    ).toMatchObject({ error: 'nav-failed' })
    expect(
      BrowserExecResponseSchema.parse({ ok: false, error: 'op-failed' }),
    ).toMatchObject({ error: 'op-failed' })
    expectReject(BrowserExecResponseSchema, { ok: false, error: 'needs-site' })
  })

  it('browser.allowSite / browser.setHumanControl', () => {
    expect(
      BrowserAllowSiteRequestSchema.parse({
        type: 'browser.allowSite',
        agentId: validAgent.id,
        host: 'example.com',
        allow: true,
      }),
    ).toMatchObject({ allow: true })
    expect(
      BrowserSetHumanControlRequestSchema.parse({
        type: 'browser.setHumanControl',
        agentId: validAgent.id,
        held: true,
      }),
    ).toMatchObject({ held: true })
    expect(
      BrowserSetHumanControlResponseSchema.parse({ ok: true, held: true }),
    ).toEqual({ ok: true, held: true })
    expect(
      BrowserAllowSiteResponseSchema.parse({ ok: false, error: 'not-open' }),
    ).toEqual({ ok: false, error: 'not-open' })
  })

  it('terminal.read / terminal.run', () => {
    expect(
      TerminalReadRequestSchema.parse({ type: 'terminal.read', agentId: validAgent.id }),
    ).toEqual({ type: 'terminal.read', agentId: validAgent.id })
    expect(
      TerminalReadResponseSchema.parse({ ok: true, text: 'prompt% ' }),
    ).toEqual({ ok: true, text: 'prompt% ' })
    for (const error of ['no-terminal', 'unknown-agent'] as const) {
      expect(TerminalReadResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
    expect(
      TerminalRunRequestSchema.parse({
        type: 'terminal.run',
        agentId: validAgent.id,
        command: 'ls',
        stealFocus: false,
      }),
    ).toMatchObject({ stealFocus: false })
    expect(
      TerminalRunResponseSchema.parse({
        ok: true,
        tabId: 'tab-1',
        exitCode: 0,
        output: 'ok',
      }),
    ).toMatchObject({ exitCode: 0 })
    for (const error of [
      'no-app',
      'unknown-agent',
      'write-denied',
      'timeout',
      'interrupted',
      'op-failed',
    ] as const) {
      expect(TerminalRunResponseSchema.parse({ ok: false, error })).toEqual({ ok: false, error })
    }
  })
})

describe('harness login kept', () => {
  it('harness.completeLogin present with agentId; startLogin errors busy|already-logged-in|agent-not-found|bad-state', () => {
    expect(HarnessCompleteLoginRequestSchema).toBeDefined()
    expect(
      HarnessCompleteLoginRequestSchema.parse({
        type: 'harness.completeLogin',
        agentId: validAgent.id,
        harness: 'claude-code',
        code: 'abc',
      }),
    ).toMatchObject({ type: 'harness.completeLogin', agentId: validAgent.id })
    expect(
      HarnessCompleteLoginResponseSchema.parse({ ok: false, error: 'agent-not-found' }),
    ).toEqual({ ok: false, error: 'agent-not-found' })
    expectReject(HarnessCompleteLoginResponseSchema, { ok: false, error: 'bot-not-found' })

    expect(
      HarnessStartLoginRequestSchema.parse({
        type: 'harness.startLogin',
        agentId: validAgent.id,
        harness: 'claude-code',
      }),
    ).toMatchObject({ agentId: validAgent.id })
    for (const error of ['busy', 'already-logged-in', 'agent-not-found', 'bad-state'] as const) {
      expect(HarnessStartLoginResponseSchema.parse({ ok: false, error })).toEqual({
        ok: false,
        error,
      })
    }
    expectReject(HarnessStartLoginResponseSchema, { ok: false, error: 'login-busy' })
    expectReject(HarnessStartLoginResponseSchema, { ok: false, error: 'harness-busy' })
  })
})
