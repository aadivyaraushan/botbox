import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('openbot', {
  request: (body: Record<string, unknown>) => ipcRenderer.invoke('daemon:request', body),
  onEvent: (cb: (ev: unknown) => void) => {
    const handler = (_: unknown, ev: unknown) => cb(ev)
    ipcRenderer.on('daemon:event', handler)
    return () => ipcRenderer.removeListener('daemon:event', handler)
  },
  onStatus: (cb: (s: { connected: boolean }) => void) => {
    const handler = (_: unknown, s: { connected: boolean }) => cb(s)
    ipcRenderer.on('daemon:status', handler)
    return () => ipcRenderer.removeListener('daemon:status', handler)
  },
  onMenu: (cb: (a: { action: string }) => void) => {
    const handler = (_: unknown, a: { action: string }) => cb(a)
    ipcRenderer.on('app:menu', handler)
    return () => ipcRenderer.removeListener('app:menu', handler)
  },
  onSelectAgent: (cb: (agentId: string) => void) => {
    const handler = (_: unknown, id: string) => cb(id)
    ipcRenderer.on('app:select-agent', handler)
    return () => ipcRenderer.removeListener('app:select-agent', handler)
  },
  setUnread: (count: number) => ipcRenderer.invoke('unread:set', { count }),
  rememberSlug: (p: { agentId: string; slug: string }) => ipcRenderer.invoke('agent:rememberSlug', p),
  history: {
    suggest: (p: { agentId: string; q: string }) => ipcRenderer.invoke('history:suggest', p),
  },
  confirmQuit: () => ipcRenderer.invoke('app:confirm-quit'),
  showWindow: () => ipcRenderer.invoke('app:show-window'),
  browser: {
    navigate: (p: { tabId: string; url: string }) => ipcRenderer.invoke('browser:navigate', p),
    back: (p: { tabId: string }) => ipcRenderer.invoke('browser:back', p),
    forward: (p: { tabId: string }) => ipcRenderer.invoke('browser:forward', p),
    reload: (p: { tabId: string }) => ipcRenderer.invoke('browser:reload', p),
    destroy: (p: { tabId: string }) => ipcRenderer.invoke('browser:destroy', p),
    setBounds: (p: {
      agentId: string
      tabId: string
      rect: { x: number; y: number; width: number; height: number }
    }) => ipcRenderer.invoke('browser:setBounds', p),
  },
  terminal: {
    create: (p: { agentId: string; tabId: string }) => ipcRenderer.invoke('terminal:create', p),
    write: (p: { tabId: string; data: string }) => ipcRenderer.invoke('terminal:write', p),
    focus: (p: { agentId: string; tabId: string }) => ipcRenderer.invoke('terminal:focus', p),
    kill: (p: { tabId: string }) => ipcRenderer.invoke('terminal:kill', p),
    onData: (cb: (ev: { tabId: string; data: string }) => void) => {
      const handler = (_: unknown, ev: { tabId: string; data: string }) => cb(ev)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
  },
  onBrowserTabNeeded: (cb: (ev: { agentId: string; tabId: string }) => void) => {
    const handler = (_: unknown, ev: { agentId: string; tabId: string }) => cb(ev)
    ipcRenderer.on('browser:need-tab', handler)
    return () => ipcRenderer.removeListener('browser:need-tab', handler)
  },
  onTerminalTabNeeded: (cb: (ev: { agentId: string; tabId: string }) => void) => {
    const handler = (_: unknown, ev: { agentId: string; tabId: string }) => cb(ev)
    ipcRenderer.on('terminal:need-tab', handler)
    return () => ipcRenderer.removeListener('terminal:need-tab', handler)
  },
})
