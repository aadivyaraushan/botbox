import { describe, expect, it } from 'vitest'
import {
  allQuestionsAnswered,
  commitMultiDone,
  commitOther,
  commitSingle,
  emptyDraft,
  toggleMulti,
  toAnswersRecord,
  type AskDraft,
  type AskQuestion,
} from './ask-answers'

const q1: AskQuestion = {
  question: 'Ship today or tomorrow?',
  header: 'Ship',
  options: [
    { label: 'Today', description: 'Ship now' },
    { label: 'Tomorrow', description: 'Wait' },
  ],
  multiSelect: false,
}

const q2: AskQuestion = {
  question: 'Which color?',
  header: 'Color',
  options: [
    { label: 'Red', description: '' },
    { label: 'Blue', description: '' },
  ],
  multiSelect: false,
}

const qMulti: AskQuestion = {
  question: 'Pick toppings',
  header: 'Toppings',
  options: [
    { label: 'Cheese', description: '' },
    { label: 'Onion', description: '' },
  ],
  multiSelect: true,
}

describe('ask-answers', () => {
  it('starts empty and is not complete', () => {
    const d = emptyDraft([q1])
    expect(allQuestionsAnswered(d, [q1])).toBe(false)
    expect(toAnswersRecord(d, [q1])).toEqual({})
  })

  it('single-select commits label keyed by question text', () => {
    let d = emptyDraft([q1])
    d = commitSingle(d, q1.question, 'Today')
    expect(d.byQuestion[q1.question]).toEqual({ kind: 'single', label: 'Today' })
    expect(allQuestionsAnswered(d, [q1])).toBe(true)
    expect(toAnswersRecord(d, [q1])).toEqual({ [q1.question]: 'Today' })
  })

  it('two questions stay incomplete after first commit', () => {
    let d = emptyDraft([q1, q2])
    d = commitSingle(d, q1.question, 'Today')
    expect(allQuestionsAnswered(d, [q1, q2])).toBe(false)
    d = commitSingle(d, q2.question, 'Red')
    expect(allQuestionsAnswered(d, [q1, q2])).toBe(true)
    expect(toAnswersRecord(d, [q1, q2])).toEqual({
      [q1.question]: 'Today',
      [q2.question]: 'Red',
    })
  })

  it('multi-select requires Done before counting as answered', () => {
    let d = emptyDraft([qMulti])
    d = toggleMulti(d, qMulti.question, 'Cheese')
    expect(allQuestionsAnswered(d, [qMulti])).toBe(false)
    d = toggleMulti(d, qMulti.question, 'Onion')
    expect(allQuestionsAnswered(d, [qMulti])).toBe(false)
    d = commitMultiDone(d, qMulti.question)
    expect(allQuestionsAnswered(d, [qMulti])).toBe(true)
    expect(toAnswersRecord(d, [qMulti])).toEqual({ [qMulti.question]: 'Cheese, Onion' })
  })

  it('Other stores typed text, not the word Other', () => {
    let d: AskDraft = emptyDraft([q1])
    d = commitOther(d, q1.question, 'Next week')
    expect(toAnswersRecord(d, [q1])).toEqual({ [q1.question]: 'Next week' })
    expect(allQuestionsAnswered(d, [q1])).toBe(true)
  })

  it('rejects empty Other text', () => {
    let d = emptyDraft([q1])
    d = commitOther(d, q1.question, '   ')
    expect(allQuestionsAnswered(d, [q1])).toBe(false)
  })
})
