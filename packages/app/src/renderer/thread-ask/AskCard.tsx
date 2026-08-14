import { useEffect, useState } from 'react'
import {
  allQuestionsAnswered,
  commitMultiDone,
  commitOther,
  commitSingle,
  emptyDraft,
  isMultiDone,
  otherText,
  selectedLabels,
  toggleMulti,
  toAnswersRecord,
  type AskDraft,
  type AskQuestion,
} from './ask-answers'

export type AskPart = {
  id: string
  questions: AskQuestion[]
  status: 'open' | 'answered' | 'cancelled'
  answers?: Record<string, string>
  response?: string
}

type Props = {
  part: AskPart
  pendingChat?: boolean
  onSubmitAnswers: (answers: Record<string, string>) => void
  onAnswerInChat: () => void
}

function labelLooksRecommended(label: string): boolean {
  return /\(Recommended\)/i.test(label)
}

export function AskCard({ part, pendingChat = false, onSubmitAnswers, onAnswerInChat }: Props) {
  const [draft, setDraft] = useState<AskDraft>(() => emptyDraft(part.questions))
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({})
  const [otherDraft, setOtherDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    setDraft(emptyDraft(part.questions))
    setOtherOpen({})
    setOtherDraft({})
  }, [part.id])

  function trySubmit(next: AskDraft) {
    if (!allQuestionsAnswered(next, part.questions)) return
    onSubmitAnswers(toAnswersRecord(next, part.questions))
  }

  if (part.status === 'cancelled') {
    return (
      <div className="ask-card ask-card-dim" data-testid="ask-card" data-status="cancelled">
        Stopped before you answered.
      </div>
    )
  }

  if (part.status === 'answered') {
    return (
      <div className="ask-card ask-card-dim" data-testid="ask-card" data-status="answered">
        {part.response ? (
          <div className="ask-answered-line">
            <span className="ask-mono">{part.response}</span>
          </div>
        ) : (
          part.questions.map((q) => {
            const ans = part.answers?.[q.question] ?? ''
            const fromOptions = q.options.some(
              (o) => o.label === ans || ans.split(', ').includes(o.label),
            )
            return (
              <div key={q.question} className="ask-answered-line">
                <div className="ask-header-chip">{q.header}</div>
                <div data-testid="ask-question-text">{q.question}</div>
                <div className={fromOptions ? undefined : 'ask-mono'}>{ans}</div>
              </div>
            )
          })
        )}
      </div>
    )
  }

  if (pendingChat) {
    return (
      <div className="ask-card ask-card-dim" data-testid="ask-card" data-status="open">
        Type your answer in the message box below.
      </div>
    )
  }

  return (
    <div className="ask-card" data-testid="ask-card" data-status="open">
      {part.questions.map((q) => {
        const selected = selectedLabels(draft, q.question)
        const done = isMultiDone(draft, q.question)
        const other = otherText(draft, q.question)
        const showOther = otherOpen[q.question] || other !== null
        return (
          <div key={q.question} className="ask-question" data-testid="ask-question">
            <div className="ask-header-chip">{q.header}</div>
            <div className="ask-question-text" data-testid="ask-question-text">
              {q.question}
            </div>
            <div className="ask-options">
              {q.options.map((opt, i) => {
                const recommended = i === 0 || labelLooksRecommended(opt.label)
                const active = selected.includes(opt.label)
                return (
                  <button
                    key={opt.label}
                    type="button"
                    className={`ask-option${active ? ' selected' : ''}`}
                    data-testid="ask-option"
                    disabled={done || other !== null}
                    onClick={() => {
                      if (q.multiSelect) {
                        setDraft((d) => toggleMulti(d, q.question, opt.label))
                        return
                      }
                      const next = commitSingle(draft, q.question, opt.label)
                      setDraft(next)
                      trySubmit(next)
                    }}
                  >
                    <div className="ask-option-label">
                      {opt.label}
                      {recommended ? <span className="ask-recommended"> Recommended</span> : null}
                    </div>
                    {opt.description ? <div className="ask-option-desc">{opt.description}</div> : null}
                  </button>
                )
              })}
              <button
                type="button"
                className={`ask-option ask-other${other !== null ? ' selected' : ''}`}
                data-testid="ask-other"
                disabled={done}
                onClick={() => setOtherOpen((o) => ({ ...o, [q.question]: true }))}
              >
                Other
              </button>
              {showOther ? (
                <div className="ask-other-row">
                  <input
                    data-testid="ask-other-input"
                    value={otherDraft[q.question] ?? other ?? ''}
                    placeholder="Type your answer"
                    onChange={(e) =>
                      setOtherDraft((d) => ({ ...d, [q.question]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    data-testid="ask-other-submit"
                    onClick={() => {
                      const text = otherDraft[q.question] ?? ''
                      const next = commitOther(draft, q.question, text)
                      setDraft(next)
                      trySubmit(next)
                    }}
                  >
                    Submit
                  </button>
                </div>
              ) : null}
              {q.multiSelect && !done ? (
                <button
                  type="button"
                  className="btn-primary"
                  data-testid="ask-multi-done"
                  disabled={selected.length === 0}
                  onClick={() => {
                    const next = commitMultiDone(draft, q.question)
                    setDraft(next)
                    trySubmit(next)
                  }}
                >
                  Done
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
      <button
        type="button"
        className="btn-ghost ask-answer-in-chat"
        data-testid="ask-answer-in-chat"
        onClick={onAnswerInChat}
      >
        Answer in chat instead
      </button>
    </div>
  )
}
