export type NotifyPayload = {
  agentId: string
  title: string
  body: string
}

export type NotifyDeps = {
  isSupported: () => boolean
  show: (opts: { title: string; body: string; onClick: () => void }) => void
  isFocused: () => boolean
  selectAgent: (agentId: string) => void
  log: (msg: string) => void
}

export function notifyAgent(deps: NotifyDeps, payload: NotifyPayload): void {
  if (deps.isFocused()) return
  if (!deps.isSupported()) {
    deps.log('[notify] unsupported')
    return
  }
  try {
    deps.show({
      title: payload.title,
      body: payload.body,
      onClick: () => deps.selectAgent(payload.agentId),
    })
  } catch {
    deps.log('[notify] permission-denied')
  }
}
