type Part =
  | { type: 'text'; id: string; text: string }
  | { type: 'reasoning'; id: string; text: string }
  | { type: 'tool'; id: string; name: string; inputSummary: string }
  | { type: 'compaction'; id: string; reason: string; forHarness?: string }
  | {
      type: 'peer-message'
      id: string
      peerName: string
      direction: 'sent' | 'received'
      text: string
    }
  | { type: 'ask-user-question'; id: string; status: string }

type Turn = {
  id: string
  source: string
  role: string
  parts: Part[]
  queued?: boolean
  dropped?: boolean
}

type Props = {
  turns: Turn[]
}

function dividerLabel(turn: Turn): string | null {
  if (turn.source === 'harness-switch-compact' || turn.source === 'compact') return 'Context compacted'
  if (turn.source === 'clear') return 'New conversation'
  const comp = turn.parts.find((p) => p.type === 'compaction')
  if (comp) return 'Context compacted'
  return null
}

export function PartTimeline({ turns }: Props) {
  return (
    <div className="thread" data-testid="thread">
      {turns.map((t) => {
        const label = dividerLabel(t)
        if (label) {
          return (
            <div key={t.id} className="divider" data-testid="compact-divider">
              {label}
            </div>
          )
        }
        return (
          <div key={t.id} data-testid={`turn-${t.id}`}>
            {t.parts.map((p) => {
              if (p.type === 'reasoning') {
                return (
                  <div key={p.id} className="part-row reasoning" data-testid="reasoning-row">
                    {p.text}
                  </div>
                )
              }
              if (p.type === 'tool') {
                return (
                  <div key={p.id} className="part-row tool" data-testid="tool-row">
                    {p.name}: {p.inputSummary}
                  </div>
                )
              }
              if (p.type === 'peer-message') {
                return (
                  <div key={p.id} className="divider" data-testid="peer-marker">
                    {p.direction === 'sent' ? `Messaged ${p.peerName}` : `Message from ${p.peerName}`}
                    {p.direction === 'received' ? `: ${p.text}` : ''}
                  </div>
                )
              }
              if (p.type === 'text') {
                return (
                  <div key={p.id} className="part-row" data-testid="text-row">
                    {p.text}
                    {t.queued ? <div className="hint">Queued</div> : null}
                    {t.dropped ? <div className="error-line">Not sent — too much queued text.</div> : null}
                  </div>
                )
              }
              return null
            })}
          </div>
        )
      })}
    </div>
  )
}
