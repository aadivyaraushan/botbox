import {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  type WebContents,
} from 'electron'
import { join } from 'node:path'
import { appendFileSync, mkdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'

export type BrowserTabView = {
  agentId: string
  slug: string
  tabId: string
  view: WebContentsView
  url: string
  title: string
}

const OFF = { x: -2000, y: 0, width: 1280, height: 800 }

const SNAPSHOT_JS = `(() => {
  document.querySelectorAll('[data-openbot-ref]').forEach((el) => el.removeAttribute('data-openbot-ref'));
  const nodes = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role]'));
  const kept = nodes.filter((el) => el.getClientRects().length > 0);
  let i = 1;
  const lines = [];
  for (const el of kept) {
    const ref = 'e' + i++;
    el.setAttribute('data-openbot-ref', ref);
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    let name = el.getAttribute('aria-label') || '';
    if (!name) {
      if ('value' in el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) name = String(el.value || '');
      else name = (el.innerText || '').trim();
    }
    name = name.slice(0, 80);
    lines.push('- role: ' + role);
    lines.push('  name: ' + name);
    lines.push('  ref: ' + ref);
  }
  return lines.join('\\n');
})()`

export class BrowserViewManager {
  private tabs = new Map<string, BrowserTabView>()
  private agentOpInFlight = new Map<string, boolean>()
  private win: BrowserWindow | null = null
  private onHumanControl: ((agentId: string) => void) | null = null
  private onTabMeta: ((tabId: string, meta: { url: string; title: string }) => void) | null = null
  private onNeedVisibleTab: ((agentId: string, tabId: string) => void) | null = null
  private openBotHome: string

  constructor(opts?: { openBotHome?: string }) {
    this.openBotHome = opts?.openBotHome ?? join(homedir(), '.openbot')
  }

  setWindow(win: BrowserWindow | null) {
    this.win = win
  }

  setHandlers(h: {
    onHumanControl: (agentId: string) => void
    onTabMeta: (tabId: string, meta: { url: string; title: string }) => void
    onNeedVisibleTab: (agentId: string, tabId: string) => void
  }) {
    this.onHumanControl = h.onHumanControl
    this.onTabMeta = h.onTabMeta
    this.onNeedVisibleTab = h.onNeedVisibleTab
  }

  private profilePath(slug: string): string {
    return join(this.openBotHome, 'private', slug, 'browser-profile')
  }

  private historyPath(slug: string): string {
    return join(this.openBotHome, 'private', slug, 'browser-history.jsonl')
  }

  ensureTab(opts: { agentId: string; slug: string; tabId: string; front?: boolean }): BrowserTabView {
    const existing = this.tabs.get(opts.tabId)
    if (existing) return existing
    mkdirSync(this.profilePath(opts.slug), { recursive: true })
    const ses = session.fromPath(this.profilePath(opts.slug))
    ses.on('will-download', (_e, item) => {
      item.setSavePath(join(app.getPath('downloads'), item.getFilename()))
    })
    const view = new WebContentsView({ webPreferences: { session: ses } })
    const entry: BrowserTabView = {
      agentId: opts.agentId,
      slug: opts.slug,
      tabId: opts.tabId,
      view,
      url: 'about:blank',
      title: 'Browser',
    }
    this.wireView(entry)
    this.tabs.set(opts.tabId, entry)
    this.win?.contentView.addChildView(view)
    view.setBounds(OFF)
    if (opts.front) this.front(opts.agentId, opts.tabId)
    return entry
  }

  private wireView(entry: BrowserTabView) {
    const wc = entry.view.webContents
    wc.setWindowOpenHandler((details) => {
      const tabId = cryptoRandom()
      const child = this.ensureTab({
        agentId: entry.agentId,
        slug: entry.slug,
        tabId,
        front: true,
      })
      void this.navigate(child.tabId, details.url)
      this.onNeedVisibleTab?.(entry.agentId, tabId)
      return { action: 'deny' }
    })
    wc.on('page-title-updated', (_e, title) => {
      entry.title = title
      this.onTabMeta?.(entry.tabId, { url: entry.url, title })
    })
    wc.on('did-navigate', (_e, url) => {
      entry.url = url
      this.appendHistory(entry.slug, url, entry.title)
      this.onTabMeta?.(entry.tabId, { url, title: entry.title })
    })
    // before-mouse-event: click takes control
    ;(wc as WebContents & { on: (ev: string, cb: (e: { type: string }) => void) => void }).on(
      'before-mouse-event',
      (e) => {
        if (e.type === 'mouseDown') this.onHumanControl?.(entry.agentId)
      },
    )
  }

  private appendHistory(slug: string, url: string, title: string) {
    try {
      mkdirSync(join(this.openBotHome, 'private', slug), { recursive: true })
      appendFileSync(
        this.historyPath(slug),
        JSON.stringify({ ts: Date.now(), url, title }) + '\n',
      )
    } catch {
      /* ignore */
    }
  }

  front(agentId: string, tabId: string, rect?: { x: number; y: number; width: number; height: number }) {
    for (const t of this.tabs.values()) {
      if (t.agentId === agentId && t.tabId === tabId) {
        t.view.setBounds(rect ?? OFF)
      } else {
        t.view.setBounds(OFF)
      }
    }
  }

  setBounds(agentId: string, tabId: string, rect: { x: number; y: number; width: number; height: number }) {
    const t = this.tabs.get(tabId)
    if (!t || t.agentId !== agentId) return
    // only apply if this is the intended front tab — caller manages
    t.view.setBounds(rect)
    for (const other of this.tabs.values()) {
      if (other.tabId !== tabId) other.view.setBounds(OFF)
    }
  }

  destroy(tabId: string) {
    const t = this.tabs.get(tabId)
    if (!t) return
    try {
      void t.view.webContents.session.flushStorageData()
    } catch {
      /* ignore */
    }
    this.win?.contentView.removeChildView(t.view)
    try {
      ;(t.view.webContents as { close?: () => void }).close?.()
    } catch {
      /* ignore */
    }
    this.tabs.delete(tabId)
  }

  frontmost(agentId: string): BrowserTabView | undefined {
    // last created / last fronted: prefer non-about:blank with recent
    const mine = [...this.tabs.values()].filter((t) => t.agentId === agentId)
    return mine[mine.length - 1]
  }

  async exec(req: Record<string, unknown>): Promise<Record<string, unknown>> {
    const agentId = String(req.agentId)
    const allowedHosts = (req.allowedHosts as string[]) ?? []
    let tab = this.frontmost(agentId)
    if (!tab) {
      const slug = String(req.slug ?? 'agent')
      const tabId = cryptoRandom()
      tab = this.ensureTab({ agentId, slug, tabId, front: true })
      console.log('[browser] ensure-tab', agentId, tabId, 'visible', this.win?.isVisible())
      this.onNeedVisibleTab?.(agentId, tabId)
    }
    const op = String(req.op)
    this.agentOpInFlight.set(agentId, true)
    try {
      if (op === 'navigate') {
        return await this.navigate(tab.tabId, String(req.url), allowedHosts)
      }
      if (op === 'snapshot') {
        const yaml = String(await tab.view.webContents.executeJavaScript(SNAPSHOT_JS))
        return { ok: true, result: { yaml } }
      }
      if (op === 'click') {
        const ref = String(req.ref)
        const ok = await tab.view.webContents.executeJavaScript(
          `(() => { const el = document.querySelector('[data-openbot-ref="'+CSS.escape(${JSON.stringify(ref)})+'"]'); if (!el) return false; el.click(); return true })()`,
        )
        if (!ok) return { ok: false, error: 'unknown-ref' }
        await Promise.race([
          new Promise<void>((resolve) => tab!.view.webContents.once('did-finish-load', () => resolve())),
          new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        ])
        return { ok: true, result: { url: tab.url, title: tab.title } }
      }
      if (op === 'type') {
        const ref = String(req.ref)
        const text = String(req.text)
        const ok = await tab.view.webContents.executeJavaScript(
          `(() => {
            const el = document.querySelector('[data-openbot-ref="'+CSS.escape(${JSON.stringify(ref)})+'"]');
            if (!el) return false;
            el.focus();
            if (el.isContentEditable) {
              el.textContent = ${JSON.stringify(text)};
              el.dispatchEvent(new InputEvent('input',{bubbles:true,data:${JSON.stringify(text)},inputType:'insertText'}));
              return true;
            }
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto,'value').set.call(el, ${JSON.stringify(text)});
            el.dispatchEvent(new Event('input',{bubbles:true}));
            el.dispatchEvent(new Event('change',{bubbles:true}));
            el.dispatchEvent(new Event('blur',{bubbles:true}));
            return true;
          })()`,
        )
        if (!ok) return { ok: false, error: 'unknown-ref' }
        return { ok: true, result: { url: tab.url, title: tab.title } }
      }
      if (op === 'screenshot') {
        const stayHidden = Boolean(this.win && !this.win.isVisible())
        const img = stayHidden
          ? await tab.view.webContents.capturePage(undefined as never, { stayHidden: true } as never)
          : await tab.view.webContents.capturePage()
        return { ok: true, result: { pngBase64: img.toPNG().toString('base64') } }
      }
      return { ok: false, error: 'op-failed' }
    } catch (e) {
      return { ok: false, error: 'op-failed' }
    } finally {
      this.agentOpInFlight.set(agentId, false)
    }
  }

  async navigate(tabId: string, url: string, allowedHosts?: string[]): Promise<Record<string, unknown>> {
    const tab = this.tabs.get(tabId)
    if (!tab) return { ok: false, error: 'unknown-agent' }
    try {
      await Promise.race([
        tab.view.webContents.loadURL(url),
        new Promise((_, rej) => setTimeout(() => rej(new Error('nav-timeout')), 30_000)),
      ])
      tab.url = tab.view.webContents.getURL()
      tab.title = tab.view.webContents.getTitle()
      this.appendHistory(tab.slug, tab.url, tab.title)
      return { ok: true, result: { url: tab.url, title: tab.title } }
    } catch (e) {
      return {
        ok: false,
        error: 'nav-failed',
        errorCode: -1,
        errorDescription: String(e),
      }
    }
  }

  back(tabId: string) {
    this.tabs.get(tabId)?.view.webContents.goBack()
  }
  forward(tabId: string) {
    this.tabs.get(tabId)?.view.webContents.goForward()
  }
  reload(tabId: string) {
    this.tabs.get(tabId)?.view.webContents.reload()
  }
}

function cryptoRandom(): string {
  return randomUUID()
}
