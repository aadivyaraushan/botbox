export type WsReadyState = { readyState: number }

/** WebSocket.OPEN */
export const WS_OPEN = 1

export type WaitForWsOpenOpts = {
  timeoutMs?: number
  pollMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** Wait until getWs() reports OPEN. Returns false on timeout. */
export async function waitForWsOpen(
  getWs: () => WsReadyState | null | undefined,
  opts: WaitForWsOpenOpts = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const pollMs = opts.pollMs ?? 25
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  const start = now()
  for (;;) {
    const sock = getWs()
    if (sock && sock.readyState === WS_OPEN) return true
    if (now() - start >= timeoutMs) return false
    await sleep(pollMs)
  }
}
