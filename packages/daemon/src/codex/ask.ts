import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type AskQuestion = {
  question: string
  header: string
  options: Array<{ label: string; description: string }>
  multiSelect: boolean
  id?: string
}

export function loadRequestUserInputFixture(): {
  id: number | string
  params: {
    questions: Array<{
      id: string
      header?: string
      question: string
      options?: Array<{ label: string; description?: string }>
      isOther?: boolean
    }>
  }
} {
  const p = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../test/fixtures/codex/request-user-input.jsonl',
  )
  if (!fs.existsSync(p)) {
    throw new Error('run the probe')
  }
  const line = fs.readFileSync(p, 'utf8').trim().split('\n')[0]!
  const msg = JSON.parse(line) as {
    id: number | string
    method?: string
    params: {
      questions: Array<{
        id: string
        header?: string
        question: string
        options?: Array<{ label: string; description?: string }>
        isOther?: boolean
      }>
    }
  }
  if (!msg.params?.questions?.[0]?.question) {
    throw new Error('run the probe')
  }
  return msg
}

export function mapRequestUserInputToAsk(params: {
  questions: Array<{
    id: string
    header?: string
    question: string
    options?: Array<{ label: string; description?: string }>
  }>
}): AskQuestion[] {
  return params.questions.map((q) => {
    const question = String(q.question ?? '')
    if (!question) throw new Error('run the probe')
    return {
      id: q.id,
      question,
      header: q.header?.trim() || question.slice(0, 12),
      options: (q.options ?? []).map((o) => ({
        label: String(o.label ?? ''),
        description: String(o.description ?? ''),
      })),
      multiSelect: false,
    }
  })
}

export function buildAskAnswerRpc(opts: {
  requestId: number | string
  questionIds: string[]
  answers: Record<string, string>
  response?: string
}): string {
  const mapped: Record<string, { answers: string[] }> = {}
  for (const id of opts.questionIds) {
    const label =
      opts.answers[id] ??
      Object.values(opts.answers)[0] ??
      (opts.response !== undefined ? opts.response : '')
    mapped[id] = { answers: [String(label)] }
  }
  return JSON.stringify({
    jsonrpc: '2.0',
    id: opts.requestId,
    result: { answers: mapped },
  })
}
