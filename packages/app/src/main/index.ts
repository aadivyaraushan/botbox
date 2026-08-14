import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
  safeStorage,
} from 'electron'
import { TerminalPtyManager } from './terminal-pty'
import { BrowserViewManager } from './browser-views'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { resolveDaemonSpawn } from './daemon-spawn'
import { loadOrCreateAdminToken } from './admin-token'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { encodeFrame, decodeFrame } from '@openbot/daemon/wire'
import { isAppleSilicon } from './arch'
import { buildAppMenu, sendToRenderer } from './menu'
import { createTray, setTrayUnread, getTrayUnread } from './tray'
import { notifyAgent } from './tray-notify'

let mainWindow: BrowserWindow | null = null
let daemonChild: ChildProcess | null = null
let ws: WebSocket | null = null
let continueTipShown = false
let quitting = false
let quitAllowed = false
const pending = new Map<string, (v: Record<string, unknown>) => void>()
const ptyManager = new TerminalPtyManager()
const browserManager = new BrowserViewManager({
  openBotHome: process.env.OPENBOT_HOME ?? join(require('node:os').homedir(), '.openbot'),
})
const agentSlug = new Map<string, string>()


function repoRoot(): string {
  return join(app.getAppPath(), '../..')
}

function getWindow(): BrowserWindow | null {
  return mainWindow
}

function connectDaemon(url: string): void {
  if (ws) {
    try {
      ws.close()
    } catch {
      /* ignore */
    }
  }
  ws = new WebSocket(url)
  ws.on('open', () => {
    console.log('[app] daemon-ws open')
    sendToRenderer(mainWindow, 'daemon:status', { connected: true })
  })
  ws.on('message', (data) => {
    const decoded = decodeFrame(String(data))
    if (!decoded.ok) return
    const v = decoded.value as Record<string, unknown>
    if (v.type === 'response' && typeof v.id === 'string') {
      const resolve = pending.get(v.id)
      if (resolve) {
        pending.delete(v.id)
        resolve(v)
        return
      }
    }
    if (v.type === 'browser.exec' || v.type === 'terminal.read' || v.type === 'terminal.run') {
      void handleDaemonAppRequest(v)
      return
    }
    sendToRenderer(mainWindow, 'daemon:event', v)
  })
  ws.on('close', () => {
    sendToRenderer(mainWindow, 'daemon:status', { connected: false })
    if (!process.env.OPENBOT_DAEMON_WS) {
      // reconnect handled by renderer tip; main may respawn
    }
  })
  ws.on('error', (err) => {
    console.log('[app] daemon-ws error', err.message)
  })
}

async function daemonRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return { id: body.id, type: 'response', ok: false, error: 'not-connected' }
  }
  const id = typeof body.id === 'string' ? body.id : randomUUID()
  const msg = { ...body, id }
  return await new Promise((resolve) => {
    pending.set(id, resolve)
    ws!.send(encodeFrame(msg))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        resolve({ id, type: 'response', ok: false, error: 'timeout' })
      }
    }, 30_000)
  })
}

function spawnDaemon(adminToken: string): void {
  const spec = resolveDaemonSpawn({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: repoRoot(),
    execPath: process.execPath,
    adminToken,
    env: process.env,
  })
  console.log('[app] spawn-daemon', {
    isPackaged: app.isPackaged,
    command: spec.command,
    args: spec.args,
  })
  daemonChild = spawn(spec.command, spec.args, {
    env: spec.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  daemonChild.stdout?.on('data', (d) => console.log('[daemon]', String(d).trimEnd()))
  daemonChild.stderr?.on('data', (d) => console.error('[daemon]', String(d).trimEnd()))
  daemonChild.on('exit', (code, signal) => {
    console.log('[daemon] exit', code, signal)
    daemonChild = null
  })
  const port = Number(process.env.OPENBOT_PORT ?? 8799)
  setTimeout(() => {
    connectDaemon(`ws://127.0.0.1:${port}/?token=${adminToken}`)
  }, 400)
}


async function handleDaemonAppRequest(v: Record<string, unknown>): Promise<void> {
  const id = String(v.id ?? '')
  const reply = (body: Record<string, unknown>) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(encodeFrame({ id, type: 'response', ...body }))
  }
  const agentId = String(v.agentId ?? '')
  if (v.type === 'browser.exec') {
    if (!agentSlug.has(agentId) && typeof v.slug === 'string') agentSlug.set(agentId, String(v.slug))
    const slug = agentSlug.get(agentId) ?? 'agent'
    const res = await browserManager.exec({ ...v, slug })
    reply(res)
    return
  }
  if (v.type === 'terminal.read') {
    reply(ptyManager.read(agentId))
    return
  }
  if (v.type === 'terminal.run') {
    const slug = agentSlug.get(agentId) ?? 'agent'
    const cwd =
      typeof v.cwd === 'string'
        ? v.cwd
        : join(process.env.OPENBOT_HOME ?? join(require('node:os').homedir(), '.openbot'), 'agents', slug, 'workspace')
    const res = await ptyManager.run({
      agentId,
      command: String(v.command ?? ''),
      cwd,
      timeoutMs: typeof v.timeoutMs === 'number' ? v.timeoutMs : undefined,
      tabId: typeof v.tabId === 'string' ? v.tabId : undefined,
      onCreated: (tabId) => sendToRenderer(mainWindow, 'terminal:need-tab', { agentId, tabId }),
    })
    reply(res)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    show: true,
    title: 'OpenBot',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  browserManager.setWindow(mainWindow)
  browserManager.setHandlers({
    onHumanControl: (agentId) => {
      void daemonRequest({ type: 'browser.setHumanControl', agentId, held: true })
    },
    onTabMeta: (tabId, meta) => sendToRenderer(mainWindow, 'browser:meta', { tabId, ...meta }),
    onNeedVisibleTab: (agentId, tabId) =>
      sendToRenderer(mainWindow, 'browser:need-tab', { agentId, tabId }),
  })
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      if (!continueTipShown) {
        continueTipShown = true
        void dialog.showMessageBox(mainWindow!, {
          type: 'info',
          message: 'Agents keep working. Use the menu bar icon to open OpenBot again.',
        })
      }
      mainWindow?.hide()
    }
  })
}

app.requestSingleInstanceLock()

void app.whenReady().then(() => {
  if (!isAppleSilicon() && process.env.OPENBOT_ALLOW_INTEL !== '1') {
    void dialog.showMessageBox({
      type: 'error',
      message: 'OpenBot needs Apple Silicon.',
    })
    return
  }

  ipcMain.handle('daemon:request', async (_e, body: Record<string, unknown>) => daemonRequest(body))
  ipcMain.handle('unread:set', (_e, payload: { count: number }) => {
    setTrayUnread(payload.count)
    return { ok: true }
  })
  ipcMain.handle('browser:navigate', async (_e, p: { tabId: string; url: string; agentId?: string }) => {
    if (p.agentId) {
      const slug = agentSlug.get(p.agentId) ?? 'agent'
      browserManager.ensureTab({ agentId: p.agentId, slug, tabId: p.tabId })
    }
    return browserManager.navigate(p.tabId, p.url)
  })
  ipcMain.handle('browser:back', (_e, p: { tabId: string }) => {
    browserManager.back(p.tabId)
    return { ok: true }
  })
  ipcMain.handle('browser:forward', (_e, p: { tabId: string }) => {
    browserManager.forward(p.tabId)
    return { ok: true }
  })
  ipcMain.handle('browser:reload', (_e, p: { tabId: string }) => {
    browserManager.reload(p.tabId)
    return { ok: true }
  })
  ipcMain.handle('browser:destroy', (_e, p: { tabId: string }) => {
    browserManager.destroy(p.tabId)
    return { ok: true }
  })
  ipcMain.handle(
    'browser:setBounds',
    (
      _e,
      p: { agentId: string; tabId: string; rect: { x: number; y: number; width: number; height: number } },
    ) => {
      // Do not ensureTab here: Chrome unmount setBounds must not recreate a destroyed view.
      browserManager.setBounds(p.agentId, p.tabId, p.rect)
      return { ok: true }
    },
  )
  ipcMain.handle('browser:ensure', (_e, p: { agentId: string; tabId: string }) => {
    const slug = agentSlug.get(p.agentId) ?? 'agent'
    browserManager.ensureTab({ agentId: p.agentId, slug, tabId: p.tabId, front: true })
    return { ok: true }
  })
  ipcMain.handle('terminal:create', (_e, p: { agentId: string; tabId: string }) => {
    const slug = agentSlug.get(p.agentId) ?? 'agent'
    const cwd = join(
      process.env.OPENBOT_HOME ?? join(require('node:os').homedir(), '.openbot'),
      'agents',
      slug,
      'workspace',
    )
    mkdirSync(cwd, { recursive: true })
    const entry = ptyManager.create({ agentId: p.agentId, tabId: p.tabId, cwd })
    entry.pty.onData((data) => sendToRenderer(mainWindow, 'terminal:data', { tabId: p.tabId, data }))
    return { ok: true, tabId: entry.tabId }
  })
  ipcMain.handle('terminal:write', (_e, p: { tabId: string; data: string }) => {
    ptyManager.write(p.tabId, p.data)
    return { ok: true }
  })
  ipcMain.handle('terminal:focus', (_e, p: { agentId: string; tabId: string }) => {
    ptyManager.focus(p.agentId, p.tabId)
    return { ok: true }
  })
  ipcMain.handle('terminal:kill', (_e, p: { tabId: string }) => {
    ptyManager.kill(p.tabId)
    return { ok: true }
  })

  ipcMain.handle('tray:getUnread', () => getTrayUnread())
  ipcMain.handle('agent:rememberSlug', (_e, p: { agentId: string; slug: string }) => {
    agentSlug.set(p.agentId, p.slug)
    return { ok: true }
  })
  ipcMain.handle('history:suggest', (_e, p: { agentId: string; q: string }) => {
    const slug = agentSlug.get(p.agentId) ?? 'agent'
    return browserManager.suggest(slug, p.q)
  })
  ipcMain.handle('app:confirm-quit', () => {
    quitAllowed = true
    app.quit()
    return { ok: true }
  })
  ipcMain.handle('app:show-window', () => {
    mainWindow?.show()
    mainWindow?.focus()
    return { ok: true }
  })
  ipcMain.handle('app:select-agent-from-notify', (_e, agentId: string) => {
    sendToRenderer(mainWindow, 'app:select-agent', agentId)
  })

  // Expose for electronApp.evaluate in Playwright
  ;(globalThis as unknown as { unread: { set: (o: { count: number }) => void }; getTrayUnread: () => boolean }).unread = {
    set: (o) => setTrayUnread(o.count),
  }
  ;(globalThis as unknown as { getTrayUnread: () => boolean }).getTrayUnread = getTrayUnread

  createWindow()
  buildAppMenu({
    onNewAgent: () => sendToRenderer(mainWindow, 'app:menu', { action: 'new-agent' }),
    onOpenBrowser: () => sendToRenderer(mainWindow, 'app:menu', { action: 'browser' }),
  })
  createTray({
    getWindow,
    onPauseAll: () => sendToRenderer(mainWindow, 'app:menu', { action: 'pause-all' }),
    onResumeAll: () => sendToRenderer(mainWindow, 'app:menu', { action: 'resume-all' }),
    onQuit: () => sendToRenderer(mainWindow, 'app:menu', { action: 'quit-check' }),
  })

  const e2eWs = process.env.OPENBOT_DAEMON_WS
  if (e2eWs) {
    connectDaemon(e2eWs)
  } else {
    const token =
      process.env.OPENBOT_ADMIN_TOKEN ??
      loadOrCreateAdminToken({
        userDataPath: app.getPath('userData'),
        safeStorage,
      })
    process.env.OPENBOT_ADMIN_TOKEN = token
    spawnDaemon(token)
  }
})

app.on('before-quit', (e) => {
  if (!quitAllowed) {
    // E2E / external daemon: Playwright app.close must not hang on wait modal.
    if (process.env.OPENBOT_DAEMON_WS) {
      quitAllowed = true
    } else {
      e.preventDefault()
      sendToRenderer(mainWindow, 'app:menu', { action: 'quit-check' })
      return
    }
  }
  quitting = true
  if (process.env.OPENBOT_DAEMON_WS) return
  if (!daemonChild) return
  e.preventDefault()
  const child = daemonChild
  daemonChild = null
  child.kill('SIGTERM')
  const t = setTimeout(() => child.kill('SIGKILL'), 5000)
  child.once('exit', () => {
    clearTimeout(t)
    app.exit(0)
  })
})

export function fireNotify(agentId: string, title: string, body: string): void {
  notifyAgent(
    {
      isSupported: () => Notification.isSupported(),
      show: ({ title: t, body: b, onClick }) => {
        const n = new Notification({ title: t, body: b })
        n.on('click', onClick)
        n.show()
      },
      isFocused: () => Boolean(mainWindow?.isFocused() && mainWindow?.isVisible()),
      selectAgent: (id) => {
        mainWindow?.show()
        mainWindow?.focus()
        sendToRenderer(mainWindow, 'app:select-agent', id)
      },
      log: (m) => console.log(m),
    },
    { agentId, title, body },
  )
}
