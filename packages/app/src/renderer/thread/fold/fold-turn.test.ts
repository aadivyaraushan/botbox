import { describe, expect, it } from 'vitest'
import { emptyTurn, foldTurnEvent } from './fold-turn'

describe('foldTurnEvent', () => {
  it('merges tool-result onto tool-use with outputSummary', () => {
    let turn = emptyTurn('t1')
    turn = foldTurnEvent(turn, {
      kind: 'tool-use',
      callId: 'c1',
      name: 'Bash',
      inputSummary: 'ls',
    })
    turn = foldTurnEvent(turn, {
      kind: 'tool-result',
      callId: 'c1',
      name: 'Bash',
      ok: false,
      outputSummary: 'write denied',
    })
    const tool = turn.parts.find((p) => p.type === 'tool')
    expect(tool).toMatchObject({
      type: 'tool',
      id: 'c1',
      name: 'Bash',
      inputSummary: 'ls',
      ok: false,
      outputSummary: 'write denied',
    })
  })

  it('concatenates reasoning deltas and keeps separate partIds', () => {
    let turn = emptyTurn('t1')
    turn = foldTurnEvent(turn, { kind: 'reasoning-text', partId: 'r1', delta: 'ab' })
    turn = foldTurnEvent(turn, { kind: 'reasoning-text', partId: 'r1', delta: 'cd' })
    turn = foldTurnEvent(turn, { kind: 'reasoning-text', partId: 'r2', delta: 'xy' })
    expect(turn.parts).toEqual([
      { type: 'reasoning', id: 'r1', text: 'abcd' },
      { type: 'reasoning', id: 'r2', text: 'xy' },
    ])
  })

  it('sets outcome and errorMessage on turn-finished', () => {
    let turn = emptyTurn('t1')
    turn = foldTurnEvent(turn, {
      kind: 'turn-finished',
      sessionId: 's',
      outcome: 'error',
      errorMessage: 'cli died',
      usage: { costUsd: null },
    })
    expect(turn.outcome).toBe('error')
    expect(turn.errorMessage).toBe('cli died')
  })

  it('applies turn-created source/role', () => {
    let turn = emptyTurn('old')
    turn = foldTurnEvent(turn, {
      kind: 'turn-created',
      turnId: 'new',
      seq: 1,
      role: 'assistant',
      source: 'clear',
      createdAt: '2026-08-15T00:00:00.000Z',
    })
    expect(turn.id).toBe('new')
    expect(turn.source).toBe('clear')
  })
})
