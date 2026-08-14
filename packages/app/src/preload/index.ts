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
})
