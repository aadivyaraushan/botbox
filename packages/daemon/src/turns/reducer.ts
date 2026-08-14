import type { HarnessEvent, TurnPart } from '@openbot/protocol'

function upsertTextLike(
  parts: TurnPart[],
  type: 'text' | 'reasoning',
  id: string,
  delta: string,
): TurnPart[] {
  const idx = parts.findIndex((p) => p.type === type && p.id === id)
  if (idx >= 0) {
    const cur = parts[idx]!
    if (cur.type !== type) return parts
    const next = [...parts]
    next[idx] = { ...cur, text: cur.text + delta }
    return next
  }
  return [...parts, { type, id, text: delta }]
}

export function applyEvent(parts: TurnPart[], ev: HarnessEvent): TurnPart[] {
  switch (ev.kind) {
    case 'reasoning-text':
      return upsertTextLike(parts, 'reasoning', ev.partId, ev.delta)
    case 'assistant-text':
      return upsertTextLike(parts, 'text', ev.partId, ev.delta)
    case 'tool-use': {
      const idx = parts.findIndex((p) => p.type === 'tool' && p.id === ev.callId)
      const tool: TurnPart = {
        type: 'tool',
        id: ev.callId,
        name: ev.name,
        inputSummary: ev.inputSummary,
      }
      if (idx >= 0) {
        const next = [...parts]
        next[idx] = { ...(parts[idx] as Extract<TurnPart, { type: 'tool' }>), ...tool }
        return next
      }
      return [...parts, tool]
    }
    case 'tool-result': {
      const idx = parts.findIndex((p) => p.type === 'tool' && p.id === ev.callId)
      if (idx < 0) {
        return [
          ...parts,
          {
            type: 'tool',
            id: ev.callId,
            name: ev.name,
            inputSummary: '',
            ok: ev.ok,
            ...(ev.outputSummary !== undefined ? { outputSummary: ev.outputSummary } : {}),
          },
        ]
      }
      const cur = parts[idx] as Extract<TurnPart, { type: 'tool' }>
      const next = [...parts]
      next[idx] = {
        ...cur,
        name: ev.name || cur.name,
        ok: ev.ok,
        ...(ev.outputSummary !== undefined ? { outputSummary: ev.outputSummary } : {}),
      }
      return next
    }
    case 'compacted': {
      const idx = parts.findIndex((p) => p.type === 'compaction' && p.id === ev.partId)
      const part: TurnPart = {
        type: 'compaction',
        id: ev.partId,
        reason: ev.reason,
        ...(ev.forHarness !== undefined ? { forHarness: ev.forHarness } : {}),
      }
      if (idx >= 0) {
        const next = [...parts]
        next[idx] = part
        return next
      }
      return [...parts, part]
    }
    case 'peer-message': {
      const idx = parts.findIndex((p) => p.type === 'peer-message' && p.id === ev.partId)
      const part: TurnPart = {
        type: 'peer-message',
        id: ev.partId,
        peerAgentId: ev.peerAgentId,
        peerName: ev.peerName,
        direction: ev.direction,
        text: ev.text,
      }
      if (idx >= 0) {
        const next = [...parts]
        next[idx] = part
        return next
      }
      return [...parts, part]
    }
    case 'ask-user-question': {
      const idx = parts.findIndex((p) => p.type === 'ask-user-question' && p.id === ev.partId)
      const part: TurnPart = {
        type: 'ask-user-question',
        id: ev.partId,
        questions: ev.questions,
        status: ev.status,
        ...(ev.answers !== undefined ? { answers: ev.answers } : {}),
        ...(ev.response !== undefined ? { response: ev.response } : {}),
      }
      if (idx >= 0) {
        const next = [...parts]
        next[idx] = part
        return next
      }
      return [...parts, part]
    }
    case 'ask-user-question-status': {
      const idx = parts.findIndex((p) => p.type === 'ask-user-question' && p.id === ev.partId)
      if (idx < 0) return parts
      const cur = parts[idx] as Extract<TurnPart, { type: 'ask-user-question' }>
      const next = [...parts]
      next[idx] = { ...cur, status: ev.status }
      return next
    }
    default:
      return parts
  }
}

export function turnText(turn: { parts: TurnPart[] }): string {
  const lines: string[] = []
  for (const p of turn.parts) {
    if (p.type === 'text') lines.push(p.text)
    else if (p.type === 'tool') lines.push(`[tool] ${p.name} ${p.inputSummary}`)
    else if (p.type === 'peer-message') lines.push(p.text)
  }
  return lines.join('\n')
}
