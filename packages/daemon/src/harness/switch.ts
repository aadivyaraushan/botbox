import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AgentConfig, HarnessEvent, Turn, TurnPart } from '@openbot/protocol'
import { turnText } from '../turns/reducer.js'

export type HarnessId = 'claude-code' | 'codex'

export type SessionsFile = {
  'claude-code': string | null
  codex: string | null
  lastInjectedSeq: { 'claude-code': number; codex: number }
}

export type StoppedTurn = {
  turnId: string
  harness: HarnessId
  sessionId: string
  interruptedAt: string
  summaryText: string
}

export function buildCompactSlice(turns: Turn[], lastInjectedSeq: number): string {
  const visible = turns.filter((t) => !t.hidden && t.seq > lastInjectedSeq)
  const chunks: string[] = []
  for (const t of visible) {
    const text = turnText(t).trim()
    if (!text) continue
    const prefix = t.role === 'user' ? '[user]' : '[assistant]'
    chunks.push(`${prefix}\n${text}`)
  }
  const joined = chunks.join('\n---\n')
  return joined.length > 32_000 ? joined.slice(-32_000) : joined
}

export async function rewriteStoppedTurnHarness(opts: {
  stoppedPath: string
  harness: HarnessId
  sessionId: string
}): Promise<StoppedTurn | null> {
  let raw: string
  try {
    raw = await fs.readFile(opts.stoppedPath, 'utf8')
  } catch {
    return null
  }
  const prev = JSON.parse(raw) as StoppedTurn
  // ONLY rewrite harness + sessionId — drop any extra/stale fields
  const stopped: StoppedTurn = {
    turnId: prev.turnId,
    harness: opts.harness,
    sessionId: opts.sessionId,
    interruptedAt: prev.interruptedAt,
    summaryText: prev.summaryText,
  }
  await fs.writeFile(opts.stoppedPath, JSON.stringify(stopped), 'utf8')
  return stopped
}

export type SwitchDeps = {
  agent: AgentConfig
  toHarness: HarnessId
  state: string
  turns: Turn[]
  sessions: SessionsFile
  privateDir: string
  loadCompactPrompt: () => string
  runCompact: (prompt: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  runInject: (opts: {
    harness: HarnessId
    sessionId: string | null
    text: string
  }) => Promise<{ ok: true; sessionId: string } | { ok: false; error: string }>
  createDestinationSession: () => Promise<string>
  persistSessions: (s: SessionsFile) => Promise<void>
  persistAgentHarness: (harness: HarnessId, model: string) => Promise<AgentConfig>
  pushHarness: (turnId: string, ev: HarnessEvent) => void
  pushTurnCreated: (turn: Turn) => void
  startResumeContinue: (opts: { sessionId: string; summaryText: string }) => Promise<void>
  setRuntimeState: (state: string) => void
  defaultModelFor: (h: HarnessId) => string
}

export type SwitchResult =
  | { ok: true; harness: HarnessId; continued: boolean; emptySlice: boolean }
  | {
      ok: false
      error: 'busy' | 'compact-failed' | 'inject-failed' | 'needs-login' | 'agent-not-found'
    }

export async function switchHarness(deps: SwitchDeps): Promise<SwitchResult> {
  if (['thinking', 'needs-you', 'memorizing', 'compacting'].includes(deps.state)) {
    return { ok: false, error: 'busy' }
  }
  if (deps.agent.harness === deps.toHarness) {
    return { ok: true, harness: deps.toHarness, continued: false, emptySlice: true }
  }

  const priorState = deps.state
  const fromHarness = deps.agent.harness
  const last = deps.sessions.lastInjectedSeq[deps.toHarness] ?? 0
  const slice = buildCompactSlice(deps.turns, last)
  const maxSeq = deps.turns.reduce((m, t) => Math.max(m, t.seq), 0)

  const stoppedPath = path.join(deps.privateDir, 'stopped-turn.json')
  let stoppedExists = false
  try {
    await fs.access(stoppedPath)
    stoppedExists = true
  } catch {
    stoppedExists = false
  }

  if (!slice.trim()) {
    deps.sessions.lastInjectedSeq[deps.toHarness] = maxSeq
    const model = deps.defaultModelFor(deps.toHarness)
    await deps.persistAgentHarness(deps.toHarness, model)
    await deps.persistSessions(deps.sessions)
    return await postSwitchContinue(deps, stoppedPath, stoppedExists, priorState, true)
  }

  deps.setRuntimeState('compacting')
  const compactPrompt = `${deps.loadCompactPrompt()}\n\n${slice}`
  const compacted = await deps.runCompact(compactPrompt)
  if (!compacted.ok) {
    deps.setRuntimeState(priorState)
    return { ok: false, error: 'compact-failed' }
  }

  let destSession = deps.sessions[deps.toHarness]
  const injected = await deps.runInject({
    harness: deps.toHarness,
    sessionId: destSession,
    text: compacted.text,
  })
  if (!injected.ok) {
    deps.setRuntimeState(priorState)
    return { ok: false, error: 'inject-failed' }
  }
  destSession = injected.sessionId
  deps.sessions[deps.toHarness] = destSession

  const model = deps.defaultModelFor(deps.toHarness)
  await deps.persistAgentHarness(deps.toHarness, model)

  const dividerId = randomUUID()
  const partId = randomUUID()
  const createdAt = new Date().toISOString()
  const seq = maxSeq + 1
  const divider: Turn = {
    id: dividerId,
    seq,
    agentId: deps.agent.id,
    role: 'assistant',
    harness: deps.toHarness,
    source: 'harness-switch-compact',
    parts: [
      {
        type: 'compaction',
        id: partId,
        reason: 'harness-switch',
        forHarness: deps.toHarness,
      } as TurnPart,
    ],
    createdAt,
  }
  deps.pushTurnCreated(divider)
  deps.pushHarness(dividerId, {
    kind: 'compacted',
    partId,
    reason: 'harness-switch',
    forHarness: deps.toHarness,
  })
  deps.sessions.lastInjectedSeq['claude-code'] = seq
  deps.sessions.lastInjectedSeq.codex = seq
  await deps.persistSessions(deps.sessions)

  return await postSwitchContinue(deps, stoppedPath, stoppedExists, priorState, false)
}

async function postSwitchContinue(
  deps: SwitchDeps,
  stoppedPath: string,
  stoppedExists: boolean,
  priorState: string,
  emptySlice: boolean,
): Promise<SwitchResult> {
  if (stoppedExists) {
    let sessionId = deps.sessions[deps.toHarness]
    if (!sessionId) {
      sessionId = await deps.createDestinationSession()
      deps.sessions[deps.toHarness] = sessionId
      await deps.persistSessions(deps.sessions)
    }
    const stopped = await rewriteStoppedTurnHarness({
      stoppedPath,
      harness: deps.toHarness,
      sessionId,
    })
    deps.setRuntimeState('idle')
    await deps.startResumeContinue({
      sessionId,
      summaryText: stopped?.summaryText ?? '',
    })
    return { ok: true, harness: deps.toHarness, continued: true, emptySlice }
  }

  if (priorState === 'paused') {
    deps.setRuntimeState('idle')
    return { ok: true, harness: deps.toHarness, continued: false, emptySlice }
  }

  deps.setRuntimeState('idle')
  return { ok: true, harness: deps.toHarness, continued: false, emptySlice }
}
