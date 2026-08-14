import { describe, expect, it } from 'vitest'
import { reasoningSummary } from './reasoning-summary'

describe('reasoningSummary', () => {
  it('returns Thought when empty', () => {
    expect(reasoningSummary('')).toBe('Thought')
    expect(reasoningSummary('   ')).toBe('Thought')
  })

  it('returns full text when under 80 chars', () => {
    expect(reasoningSummary('short thought')).toBe('short thought')
  })

  it('truncates to first 80 characters', () => {
    const long = 'x'.repeat(100)
    expect(reasoningSummary(long)).toBe('x'.repeat(80))
  })
})
