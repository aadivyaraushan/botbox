import { describe, expect, it, vi } from 'vitest'
import { refreshAgentsList } from './daemon-list-sync'

describe('refreshAgentsList', () => {
  it('fails the one-shot list-before-connect pattern: retries until ok', async () => {
    const calls: string[] = []
    const api = vi.fn(async () => {
      calls.push('list')
      if (calls.length < 3) return { ok: false, error: 'not-connected' }
      return { ok: true, agents: [{ agent: { id: 'a1', name: 'Ada' } }] }
    })
    const sleep = vi.fn(async () => {})
    const res = await refreshAgentsList({ api, maxAttempts: 5, delayMs: 1, sleep })
    expect(res?.ok).toBe(true)
    expect(api).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect((res as { agents: unknown[] }).agents[0]).toMatchObject({
      agent: { name: 'Ada' },
    })
  })

  it('does not retry permanent errors', async () => {
    const api = vi.fn(async () => ({ ok: false, error: 'auth-failed' }))
    const sleep = vi.fn(async () => {})
    const res = await refreshAgentsList({ api, maxAttempts: 5, delayMs: 1, sleep })
    expect(res).toEqual({ ok: false, error: 'auth-failed' })
    expect(api).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('returns last not-connected after exhausting attempts', async () => {
    const api = vi.fn(async () => ({ ok: false, error: 'not-connected' }))
    const sleep = vi.fn(async () => {})
    const res = await refreshAgentsList({ api, maxAttempts: 3, delayMs: 1, sleep })
    expect(res).toEqual({ ok: false, error: 'not-connected' })
    expect(api).toHaveBeenCalledTimes(3)
  })
})
