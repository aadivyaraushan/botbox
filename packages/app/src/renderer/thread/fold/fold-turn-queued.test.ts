import { describe, expect, it } from 'vitest'
import { emptyTurn, foldTurnEvent } from './fold-turn'

describe('foldTurnEvent user turn-created text', () => {
  it('adds a text part from turn-created.text for role user', () => {
    const base = emptyTurn('t1')
    const next = foldTurnEvent(base, {
      kind: 'turn-created',
      turnId: 't1',
      seq: 2,
      role: 'user',
      source: 'user',
      createdAt: '2026-08-15T00:00:00.000Z',
      text: 'Queued please',
    })
    expect(next.role).toBe('user')
    expect(next.parts).toEqual([{ type: 'text', id: 't1', text: 'Queued please' }])
  })
})
