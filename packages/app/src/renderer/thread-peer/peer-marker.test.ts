import { describe, expect, it } from 'vitest'
import { formatPeerMarker, truncatePeerText, PEER_PREVIEW_MAX } from './peer-marker'

describe('truncatePeerText', () => {
  it('keeps short text', () => {
    expect(truncatePeerText('Please help')).toBe('Please help')
  })

  it(`cuts at ${PEER_PREVIEW_MAX} without ellipsis`, () => {
    const long = 'a'.repeat(PEER_PREVIEW_MAX + 20)
    expect(truncatePeerText(long)).toBe('a'.repeat(PEER_PREVIEW_MAX))
    expect(truncatePeerText(long).length).toBe(PEER_PREVIEW_MAX)
  })
})

describe('formatPeerMarker', () => {
  it('sent → Messaged {peerName} with truncated preview', () => {
    const long = 'x'.repeat(PEER_PREVIEW_MAX + 5)
    expect(formatPeerMarker({ direction: 'sent', peerName: 'Bea', text: long })).toEqual({
      title: 'Messaged Bea',
      preview: 'x'.repeat(PEER_PREVIEW_MAX),
    })
  })

  it('sent with empty text → title only', () => {
    expect(formatPeerMarker({ direction: 'sent', peerName: 'Bea', text: '' })).toEqual({
      title: 'Messaged Bea',
      preview: null,
    })
  })

  it('received → Message from {peerName} with full inbound text', () => {
    const long = 'y'.repeat(PEER_PREVIEW_MAX + 5)
    expect(formatPeerMarker({ direction: 'received', peerName: 'Ada', text: long })).toEqual({
      title: 'Message from Ada',
      preview: long,
    })
  })
})
