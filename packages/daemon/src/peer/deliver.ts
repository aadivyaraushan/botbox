import type { AgentConfig, AgentRuntime } from '@openbot/protocol'

export type PeerSendResult =
  | { ok: true }
  | { ok: false; error: 'not-found' | 'self' | 'paused' | 'needs-login' }

export function validatePeerSend(opts: {
  fromId: string
  toAgentId: string
  agents: AgentConfig[]
  getRuntime: (id: string) => AgentRuntime | undefined
}): PeerSendResult {
  if (opts.fromId === opts.toAgentId) return { ok: false, error: 'self' }
  const to = opts.agents.find((a) => a.id === opts.toAgentId)
  if (!to) return { ok: false, error: 'not-found' }
  const rt = opts.getRuntime(to.id)
  if (!rt) return { ok: false, error: 'not-found' }
  if (rt.state === 'paused') return { ok: false, error: 'paused' }
  const harness = to.harness
  if (rt.harnessAuth[harness] === 'logged-out') return { ok: false, error: 'needs-login' }
  return { ok: true }
}
