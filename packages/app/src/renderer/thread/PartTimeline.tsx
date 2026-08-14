import { AskCard, type AskPart } from '../thread-ask/AskCard'
import type { AskQuestion } from '../thread-ask/ask-answers'
import { formatPeerMarker } from '../thread-peer/peer-marker'

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
  | {
      type: 'ask-user-question'
      id: string
      status: 'open' | 'answered' | 'cancelled'
      questions: AskQuestion[]
      answers?: Record<string, string>
      response?: string
    }

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
  answerChatPartId?: string | null
  onAskAnswer: (partId: string, answers: Record<string, string>) => void
  onAskAnswerInChat: (partId: string) => void
}

function dividerLabel(turn: Turn): string | null {
  if (turn.source === 'harness-switch-compact' || turn.source === 'compact') return 'Context compacted'
  if (turn.source === 'clear') return 'New conversation'
  const comp = turn.parts.find((p) => p.type === 'compaction')
  if (comp) return 'Context compacted'
  return null
}

function asAskPart(p: Extract<Part, { type: 'ask-user-question' }>): AskPart {
  return {
    id: p.id,
    status: p.status,
    questions: (p.questions ?? []).map((q) => ({
      question: q.question,
      header: q.header,
      options: q.options ?? [],
      multiSelect: Boolean(q.multiSelect),
    })),
    answers: p.answers,
    response: p.response,
  }
}

export function PartTimeline({ turns, answerChatPartId, onAskAnswer, onAskAnswerInChat }: Props) {
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
                const marker = formatPeerMarker({
                  direction: p.direction,
                  peerName: p.peerName,
                  text: p.text,
                })
                return (
                  <div key={p.id} className="divider" data-testid="peer-marker">
                    <div data-testid="peer-marker-title">{marker.title}</div>
                    {marker.preview ? (
                      <div data-testid="peer-marker-preview">{marker.preview}</div>
                    ) : null}
                  </div>
                )
              }
              if (p.type === 'ask-user-question') {
                return (
                  <AskCard
                    key={p.id}
                    part={asAskPart(p)}
                    pendingChat={answerChatPartId === p.id}
                    onSubmitAnswers={(answers) => onAskAnswer(p.id, answers)}
                    onAnswerInChat={() => onAskAnswerInChat(p.id)}
                  />
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
