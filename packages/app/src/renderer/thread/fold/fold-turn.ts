import { applyEvent } from '@openbot/daemon/turns'
import type { HarnessEvent, TurnPart } from '@openbot/protocol'

export type FoldTurn = {
  id: string
  source: string
  role: string
  parts: TurnPart[]
  queued?: boolean
  dropped?: boolean
  outcome?: 'complete' | 'interrupted' | 'error'
  errorMessage?: string
}

/** Fold a harness stream event into one turn. Uses shared applyEvent for part kinds. */
export function foldTurnEvent(turn: FoldTurn, event: HarnessEvent): FoldTurn {
  if (event.kind === 'turn-created') {
    return {
      ...turn,
      id: event.turnId,
      source: event.source,
      role: event.role,
    }
  }
  if (event.kind === 'turn-finished') {
    return {
      ...turn,
      outcome: event.outcome,
      ...(event.errorMessage !== undefined ? { errorMessage: event.errorMessage } : {}),
    }
  }
  return { ...turn, parts: applyEvent(turn.parts, event) }
}

export function emptyTurn(id: string): FoldTurn {
  return { id, source: 'user', role: 'assistant', parts: [] }
}
