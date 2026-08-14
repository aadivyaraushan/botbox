/** Retry agent.list until connected (or attempts exhausted). One-shot list-before-connect must fail this. */

export type ListApi = (body: Record<string, unknown>) => Promise<Record<string, unknown>>

export type RefreshAgentsListOpts = {
  api: ListApi
  maxAttempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export async function refreshAgentsList(
  opts: RefreshAgentsListOpts,
): Promise<Record<string, unknown> | null> {
  const maxAttempts = opts.maxAttempts ?? 40
  const delayMs = opts.delayMs ?? 50
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  let last: Record<string, unknown> | null = null
  for (let i = 0; i < maxAttempts; i++) {
    const res = await opts.api({ type: 'agent.list' })
    last = res
    if (res.ok) return res
    const err = String(res.error ?? '')
    if (err !== 'not-connected' && err !== 'timeout') return res
    await sleep(delayMs)
  }
  return last
}
