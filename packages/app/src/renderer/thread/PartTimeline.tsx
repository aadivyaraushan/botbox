import { useEffect, useRef, useState } from 'react'
import { AskCard, type AskPart } from '../thread-ask/AskCard'
import type { AskQuestion } from '../thread-ask/ask-answers'
import { formatPeerMarker } from '../thread-peer/peer-marker'
import { reasoningSummary } from './reasoning-summary'
import {
  initialStickState,
  jumpToLatest,
  onThreadScroll,
  shouldAutoScroll,
  type StickState,
} from './stick-scroll'

type Part =
  | { type: 'text'; id: string; text: string }
  | { type: 'reasoning'; id: string; text: string }
  | {
      type: 'tool'
      id: string
      name: string
      inputSummary: string
      outputSummary?: string
      ok?: boolean
    }
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
  outcome?: 'complete' | 'interrupted' | 'error'
  errorMessage?: string
}

type Props = {
  turns: Turn[]
  streaming: boolean
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

function ReasoningRow({
  text,
  turnFinished,
}: {
  text: string
  turnFinished: boolean
}) {
  const [open, setOpen] = useState(!turnFinished)
  useEffect(() => {
    setOpen(!turnFinished)
  }, [turnFinished])
  const summary = reasoningSummary(text)
  return (
    <button
      type="button"
      className="part-row reasoning"
      data-testid="reasoning-row"
      data-expanded={open ? 'true' : 'false'}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      {open ? text || 'Thought' : summary}
    </button>
  )
}

function ToolRow({
  name,
  inputSummary,
  outputSummary,
}: {
  name: string
  inputSummary: string
  outputSummary?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      className="part-row tool"
      data-testid="tool-row"
      data-expanded={open ? 'true' : 'false'}
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
    >
      <div>
        {name}: {inputSummary}
      </div>
      {open && outputSummary !== undefined ? (
        <pre className="tool-output" data-testid="tool-output">
          {outputSummary}
        </pre>
      ) : null}
    </button>
  )
}

function OutcomeRow({ turn }: { turn: Turn }) {
  if (turn.outcome === 'interrupted') {
    return (
      <div className="part-row outcome muted" data-testid="turn-outcome">
        Stopped.
      </div>
    )
  }
  if (turn.outcome === 'error') {
    return (
      <div className="part-row outcome" data-testid="turn-outcome">
        <div>Something went wrong.</div>
        {turn.errorMessage ? (
          <div className="ask-mono" data-testid="turn-error-message">
            {turn.errorMessage}
          </div>
        ) : null}
      </div>
    )
  }
  return null
}

export function PartTimeline({
  turns,
  streaming,
  answerChatPartId,
  onAskAnswer,
  onAskAnswerInChat,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [stick, setStick] = useState<StickState>(initialStickState)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    if (!shouldAutoScroll(stick.stuck, streaming)) return
    el.scrollTop = el.scrollHeight
  }, [turns, streaming, stick.stuck])

  return (
    <div className="thread-wrap">
      <div
        className="thread"
        data-testid="thread"
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current
          if (!el) return
          const distance = el.scrollHeight - el.scrollTop - el.clientHeight
          setStick((prev) => onThreadScroll(distance, prev))
        }}
      >
        {turns.map((t) => {
          const label = dividerLabel(t)
          if (label) {
            return (
              <div key={t.id} className="divider" data-testid="compact-divider">
                {label}
              </div>
            )
          }
          const finished = Boolean(t.outcome)
          return (
            <div key={t.id} data-testid={`turn-${t.id}`}>
              {t.parts.map((p) => {
                if (p.type === 'reasoning') {
                  return <ReasoningRow key={p.id} text={p.text} turnFinished={finished} />
                }
                if (p.type === 'tool') {
                  return (
                    <ToolRow
                      key={p.id}
                      name={p.name}
                      inputSummary={p.inputSummary}
                      outputSummary={p.outputSummary}
                    />
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
                      {t.dropped ? (
                        <div className="error-line">Not sent — too much queued text.</div>
                      ) : null}
                    </div>
                  )
                }
                return null
              })}
              <OutcomeRow turn={t} />
            </div>
          )
        })}
      </div>
      {stick.showJump ? (
        <button
          type="button"
          className="jump-latest"
          data-testid="jump-to-latest"
          onClick={() => {
            setStick(jumpToLatest())
            const el = scrollerRef.current
            if (el) el.scrollTop = el.scrollHeight
          }}
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  )
}
