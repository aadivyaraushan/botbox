import { describe, expect, it, vi } from 'vitest'
import { waitForWsOpen, WS_OPEN } from './daemon-ws-ready'

describe('waitForWsOpen', () => {
  it('returns false when socket stays closed past timeout', async () => {
    let t = 0
    const ok = await waitForWsOpen(() => ({ readyState: 0 }), {
      timeoutMs: 40,
      pollMs: 10,
      now: () => t,
      sleep: async (ms) => {
        t += ms
      },
    })
    expect(ok).toBe(false)
  })

  it('returns true once socket reaches OPEN after CONNECTING', async () => {
    let state = 0
    let t = 0
    const sleep = vi.fn(async (ms: number) => {
      t += ms
      if (t >= 20) state = WS_OPEN
    })
    const ok = await waitForWsOpen(() => ({ readyState: state }), {
      timeoutMs: 100,
      pollMs: 10,
      now: () => t,
      sleep,
    })
    expect(ok).toBe(true)
    expect(sleep).toHaveBeenCalled()
  })

  it('returns true when already OPEN without sleeping', async () => {
    const sleep = vi.fn(async () => {})
    const ok = await waitForWsOpen(() => ({ readyState: WS_OPEN }), {
      timeoutMs: 100,
      pollMs: 10,
      sleep,
    })
    expect(ok).toBe(true)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('treats null socket as not ready until provided', async () => {
    let sock: { readyState: number } | null = null
    let t = 0
    const ok = await waitForWsOpen(() => sock, {
      timeoutMs: 50,
      pollMs: 10,
      now: () => t,
      sleep: async (ms) => {
        t += ms
        if (t >= 20) sock = { readyState: WS_OPEN }
      },
    })
    expect(ok).toBe(true)
  })
})
