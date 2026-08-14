import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
} from 'electron'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
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
const pending = new Map<string, (v: Record<string, unknown>) => void>()

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
  const root = repoRoot()
  const tsx = join(root, 'node_modules/.bin/tsx')
  const main = join(root, 'packages/daemon/src/main.ts')
  daemonChild = spawn(tsx, [main], {
    env: { ...process.env, OPENBOT_ADMIN_TOKEN: adminToken },
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
  ipcMain.handle('tray:getUnread', () => getTrayUnread())
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
  })

  const e2eWs = process.env.OPENBOT_DAEMON_WS
  if (e2eWs) {
    connectDaemon(e2eWs)
  } else {
    const token = process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(32).toString('hex')
    process.env.OPENBOT_ADMIN_TOKEN = token
    spawnDaemon(token)
  }
})

app.on('before-quit', (e) => {
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
