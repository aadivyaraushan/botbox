import { describe, expect, it } from 'vitest'
import { initialStickState, jumpToLatest, onThreadScroll, shouldAutoScroll } from './stick-scroll'

describe('stick-scroll', () => {
  it('releases and shows Jump after more than 80px from bottom', () => {
    const next = onThreadScroll(81, initialStickState())
    expect(next).toEqual({ stuck: false, showJump: true })
  })

  it('stays stuck when within 80px while already stuck', () => {
    expect(onThreadScroll(40, initialStickState())).toEqual({ stuck: true, showJump: false })
  })

  it('Jump to latest re-sticks', () => {
    expect(jumpToLatest()).toEqual({ stuck: true, showJump: false })
  })

  it('auto-scrolls only when stuck and streaming', () => {
    expect(shouldAutoScroll(true, true)).toBe(true)
    expect(shouldAutoScroll(false, true)).toBe(false)
    expect(shouldAutoScroll(true, false)).toBe(false)
  })
})
