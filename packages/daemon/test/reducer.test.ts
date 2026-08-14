import { describe, expect, it } from 'vitest'
import { applyEvent, turnText } from '../src/turns/reducer.js'
import type { TurnPart } from '@openbot/protocol'

describe('reducer', () => {
  it('upserts text/reasoning and tools; compacted; peer; ask status', () => {
    let parts: TurnPart[] = []
    parts = applyEvent(parts, { kind: 'reasoning-text', partId: 'r1', delta: 'a' })
    parts = applyEvent(parts, { kind: 'reasoning-text', partId: 'r1', delta: 'b' })
    parts = applyEvent(parts, { kind: 'assistant-text', partId: 't1', delta: 'hi' })
    parts = applyEvent(parts, { kind: 'assistant-text', partId: 't1', delta: '!' })
    parts = applyEvent(parts, {
      kind: 'tool-use',
      callId: 'c1',
      name: 'Bash',
      inputSummary: 'ls',
    })
    parts = applyEvent(parts, {
      kind: 'tool-use',
      callId: 'c1',
      name: 'Bash',
      inputSummary: 'ls -la',
    })
    parts = applyEvent(parts, {
      kind: 'tool-result',
      callId: 'c1',
      name: 'Bash',
      ok: true,
      outputSummary: 'ok',
    })
    parts = applyEvent(parts, {
      kind: 'tool-result',
      callId: 'missing',
      name: 'Read',
      ok: false,
      outputSummary: 'nope',
    })
    parts = applyEvent(parts, {
      kind: 'compacted',
      partId: 'k1',
      reason: 'overflow',
      forHarness: 'claude-code',
    })
    parts = applyEvent(parts, {
      kind: 'compacted',
      partId: 'k1',
      reason: 'again',
    })
    parts = applyEvent(parts, {
      kind: 'peer-message',
      partId: 'p1',
      peerAgentId: 'x',
      peerName: 'X',
      direction: 'sent',
      text: 'ping',
    })
    parts = applyEvent(parts, {
      kind: 'peer-message',
      partId: 'p1',
      peerAgentId: 'x',
      peerName: 'X',
      direction: 'received',
      text: 'pong',
    })
    parts = applyEvent(parts, {
      kind: 'ask-user-question',
      partId: 'a1',
      questions: [{ id: 'q1', prompt: 'Q?' }],
      status: 'open',
    })
    parts = applyEvent(parts, {
      kind: 'ask-user-question',
      partId: 'a1',
      questions: [{ id: 'q1', prompt: 'Q?' }],
      status: 'answered',
      answers: { q1: 'yes' },
      response: 'yes',
    })
    parts = applyEvent(parts, {
      kind: 'ask-user-question-status',
      partId: 'a1',
      status: 'cancelled',
    })
    parts = applyEvent(parts, {
      kind: 'ask-user-question-status',
      partId: 'nope',
      status: 'cancelled',
    })
    // unknown / non-part events pass through default
    parts = applyEvent(parts, { kind: 'turn-started', turnId: 'u1' } as never)
    expect(parts.find((p) => p.type === 'reasoning')?.text).toBe('ab')
    expect(parts.find((p) => p.type === 'text')?.text).toBe('hi!')
    expect(turnText({ parts })).toContain('hi!')
    expect(turnText({ parts })).toContain('[tool]')
    expect(turnText({ parts })).toContain('pong')
  })
})
