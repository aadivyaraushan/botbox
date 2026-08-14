import { describe, expect, it } from 'vitest'
import { filterHistorySuggestions, resolveAddressBar } from './suggest-url'

describe('resolveAddressBar', () => {
  it('prefers matching history url', () => {
    expect(resolveAddressBar('examp', ['https://example.com/a', 'https://other.com'])).toBe(
      'https://example.com/a',
    )
  })

  it('falls back to Google search when no history match', () => {
    expect(resolveAddressBar('openbot docs', [])).toBe(
      'https://www.google.com/search?q=openbot%20docs',
    )
  })

  it('keeps absolute https urls', () => {
    expect(resolveAddressBar('https://x.test/path', [])).toBe('https://x.test/path')
  })
})

describe('filterHistorySuggestions', () => {
  it('returns newest matching urls first, capped at 20', () => {
    const entries = [
      { url: 'https://a.test/1', ts: 1 },
      { url: 'https://a.test/2', ts: 3 },
      { url: 'https://b.test', ts: 2 },
    ]
    expect(filterHistorySuggestions('a.test', entries)).toEqual([
      'https://a.test/2',
      'https://a.test/1',
    ])
  })
})
