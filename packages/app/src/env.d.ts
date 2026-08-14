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
  rememberSlug: (p: { agentId: string; slug: string }) => Promise<unknown>
  history: {
    suggest: (p: { agentId: string; q: string }) => Promise<{ urls: string[] }>
  }
  confirmQuit: () => Promise<unknown>
  showWindow: () => Promise<unknown>
  browser: {
    navigate: (p: { tabId: string; url: string }) => Promise<unknown>
    back: (p: { tabId: string }) => Promise<unknown>
    forward: (p: { tabId: string }) => Promise<unknown>
    reload: (p: { tabId: string }) => Promise<unknown>
    setBounds: (p: {
      agentId: string
      tabId: string
      rect: { x: number; y: number; width: number; height: number }
    }) => Promise<unknown>
  }
  terminal: {
    create: (p: { agentId: string; tabId: string }) => Promise<unknown>
    write: (p: { tabId: string; data: string }) => Promise<unknown>
    focus: (p: { agentId: string; tabId: string }) => Promise<unknown>
    onData: (cb: (ev: { tabId: string; data: string }) => void) => () => void
  }
  onBrowserTabNeeded: (cb: (ev: { agentId: string; tabId: string }) => void) => () => void
  onTerminalTabNeeded: (cb: (ev: { agentId: string; tabId: string }) => void) => () => void
}

interface Window {
  openbot: OpenBotApi
}
