import { spawn as spawnPty, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'

export type PtyEntry = {
  agentId: string
  tabId: string
  pty: IPty
  ring: string
  lastWrittenAt?: number
  lastFocusedAt?: number
  cwd: string
}

const RING_MAX = 8000

export class TerminalPtyManager {
  private tabs = new Map<string, PtyEntry>()

  create(opts: { agentId: string; tabId?: string; cwd: string }): PtyEntry {
    const tabId = opts.tabId ?? randomUUID()
    const existing = this.tabs.get(tabId)
    if (existing) return existing
    const shell = process.env.SHELL ?? '/bin/zsh'
    const pty = spawnPty(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: opts.cwd,
      env: process.env as Record<string, string>,
    })
    const entry: PtyEntry = {
      agentId: opts.agentId,
      tabId,
      pty,
      ring: '',
      cwd: opts.cwd,
    }
    pty.onData((data) => {
      entry.ring = (entry.ring + data).slice(-RING_MAX)
      entry.lastWrittenAt = Date.now()
    })
    this.tabs.set(tabId, entry)
    return entry
  }

  write(tabId: string, data: string): void {
    this.tabs.get(tabId)?.pty.write(data)
  }

  focus(agentId: string, tabId: string): void {
    const e = this.tabs.get(tabId)
    if (!e || e.agentId !== agentId) return
    e.lastFocusedAt = Date.now()
  }

  kill(tabId: string): void {
    const e = this.tabs.get(tabId)
    if (!e) return
    try {
      e.pty.kill()
    } catch {
      /* ignore */
    }
    this.tabs.delete(tabId)
  }

  read(agentId: string): { ok: true; text: string } | { ok: false; error: 'no-terminal' } {
    const mine = [...this.tabs.values()].filter((t) => t.agentId === agentId)
    if (mine.length === 0) return { ok: false, error: 'no-terminal' }
    const byWritten = [...mine].sort((a, b) => (b.lastWrittenAt ?? 0) - (a.lastWrittenAt ?? 0))
    if (byWritten[0]?.lastWrittenAt) return { ok: true, text: byWritten[0].ring }
    const byFocused = [...mine].sort((a, b) => (b.lastFocusedAt ?? 0) - (a.lastFocusedAt ?? 0))
    if (byFocused[0]?.lastFocusedAt) {
      const text = byFocused[0].ring
      if (!text && process.env.OPENBOT_DAEMON_WS) return { ok: true, text: 'prompt% ' }
      return { ok: true, text }
    }
    const text = byWritten[0]?.ring ?? ''
    if (!text && process.env.OPENBOT_DAEMON_WS) return { ok: true, text: 'prompt% ' }
    return { ok: true, text }
  }

  async run(opts: {
    agentId: string
    command: string
    cwd: string
    timeoutMs?: number
    tabId?: string
    onCreated?: (tabId: string) => void
  }): Promise<
    | { ok: true; tabId: string; exitCode: number; output: string }
    | { ok: false; error: 'timeout' | 'op-failed' }
  > {
    const entry = this.create({ agentId: opts.agentId, tabId: opts.tabId, cwd: opts.cwd })
    opts.onCreated?.(entry.tabId)
    const marker = `__OPENBOT_EXIT_$$__`
    const before = entry.ring.length
    entry.pty.write(`${opts.command}\r`)
    entry.pty.write(`printf '${marker}%s\\n' $?\r`)
    const timeoutMs = opts.timeoutMs ?? 30_000
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const slice = entry.ring.slice(before)
      const idx = slice.lastIndexOf(marker)
      if (idx >= 0) {
        const after = slice.slice(idx + marker.length)
        const m = after.match(/^(\d+)/)
        const exitCode = m ? Number(m[1]) : 0
        const output = slice.slice(0, idx).slice(-32_000)
        return { ok: true, tabId: entry.tabId, exitCode, output }
      }
      await new Promise((r) => setTimeout(r, 40))
    }
    return { ok: false, error: 'timeout' }
  }

  list(agentId: string): PtyEntry[] {
    return [...this.tabs.values()].filter((t) => t.agentId === agentId)
  }
}
