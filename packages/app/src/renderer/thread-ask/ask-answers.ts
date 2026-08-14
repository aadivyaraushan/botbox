export type AskOption = { label: string; description: string }

export type AskQuestion = {
  question: string
  header: string
  options: AskOption[]
  multiSelect: boolean
}

type Entry =
  | { kind: 'single'; label: string }
  | { kind: 'other'; text: string }
  | { kind: 'multi'; labels: string[]; done: boolean }

export type AskDraft = {
  byQuestion: Record<string, Entry>
}

export function emptyDraft(_questions: AskQuestion[]): AskDraft {
  return { byQuestion: {} }
}

export function commitSingle(draft: AskDraft, question: string, label: string): AskDraft {
  return {
    byQuestion: {
      ...draft.byQuestion,
      [question]: { kind: 'single', label },
    },
  }
}

export function commitOther(draft: AskDraft, question: string, text: string): AskDraft {
  const trimmed = text.trim()
  if (!trimmed) return draft
  return {
    byQuestion: {
      ...draft.byQuestion,
      [question]: { kind: 'other', text: trimmed },
    },
  }
}

export function toggleMulti(draft: AskDraft, question: string, label: string): AskDraft {
  const cur = draft.byQuestion[question]
  const labels = cur?.kind === 'multi' ? [...cur.labels] : ([] as string[])
  const idx = labels.indexOf(label)
  if (idx >= 0) labels.splice(idx, 1)
  else labels.push(label)
  return {
    byQuestion: {
      ...draft.byQuestion,
      [question]: { kind: 'multi', labels, done: false },
    },
  }
}

export function commitMultiDone(draft: AskDraft, question: string): AskDraft {
  const cur = draft.byQuestion[question]
  if (!cur || cur.kind !== 'multi' || cur.labels.length === 0) return draft
  return {
    byQuestion: {
      ...draft.byQuestion,
      [question]: { ...cur, done: true },
    },
  }
}

function entryAnswered(entry: Entry | undefined): boolean {
  if (!entry) return false
  if (entry.kind === 'single') return entry.label.length > 0
  if (entry.kind === 'other') return entry.text.length > 0
  return entry.done && entry.labels.length > 0
}

export function allQuestionsAnswered(draft: AskDraft, questions: AskQuestion[]): boolean {
  return questions.every((q) => entryAnswered(draft.byQuestion[q.question]))
}

export function toAnswersRecord(draft: AskDraft, questions: AskQuestion[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const q of questions) {
    const entry = draft.byQuestion[q.question]
    if (!entryAnswered(entry) || !entry) continue
    if (entry.kind === 'single') out[q.question] = entry.label
    else if (entry.kind === 'other') out[q.question] = entry.text
    else out[q.question] = entry.labels.join(', ')
  }
  return out
}

export function selectedLabels(draft: AskDraft, question: string): string[] {
  const entry = draft.byQuestion[question]
  if (!entry) return []
  if (entry.kind === 'single') return [entry.label]
  if (entry.kind === 'other') return []
  return entry.labels
}

export function isMultiDone(draft: AskDraft, question: string): boolean {
  const entry = draft.byQuestion[question]
  return entry?.kind === 'multi' && entry.done
}

export function otherText(draft: AskDraft, question: string): string | null {
  const entry = draft.byQuestion[question]
  return entry?.kind === 'other' ? entry.text : null
}
