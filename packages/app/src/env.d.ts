/// <reference types="vite/client" />

declare module '*.svg?raw' {
  const src: string
  export default src
}

type OpenBotApi = {
  request: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
  onEvent: (cb: (ev: unknown) => void) => () => void
  onStatus: (cb: (s: { connected: boolean }) => void) => () => void
  onMenu: (cb: (a: { action: string }) => void) => () => void
  onSelectAgent: (cb: (agentId: string) => void) => () => void
  setUnread: (count: number) => Promise<unknown>
}

interface Window {
  openbot: OpenBotApi
}
