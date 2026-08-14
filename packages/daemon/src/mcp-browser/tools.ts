import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { hostAllowed, hostFromUrl } from './hosts.js'

export const BROWSER_NAVIGATE_DESC =
  "Open a URL in this agent's in-app browser (the pane the human can also see). A new site waits for the human to allow it."
export const BROWSER_SNAPSHOT_DESC =
  'List clickable and fillable elements on the current page, each with a ref (e1, e2, …). Refs die after navigate or a new snapshot.'
export const BROWSER_CLICK_DESC = 'Click an element from the last snapshot. Pass its ref.'
export const BROWSER_TYPE_DESC =
  'Type into an element from the last snapshot. Pass its ref and the text.'
export const BROWSER_SCREENSHOT_DESC =
  'Take a PNG of the current page. Use when layout or images matter more than the element list.'
export const TERMINAL_READ_DESC =
  "Read the last output from this agent's Terminal tabs (most recently written, else last-focused; only errors when there are no tabs)."
export const SHELL_RUN_DESC =
  'Run a shell command in a visible Terminal tab for this agent. Never steals focus. Write-deny still applies.'

export type BrowserToolDeps = {
  agentId: string
  getAllowedHosts: () => string[]
  isHumanControlHeld: () => boolean
  hasSiteAskOpen: () => boolean
  navigateWithGate: (url: string) => Promise<
    | { ok: true; result: { url: string; title: string } }
    | { ok: false; error: string; host?: string }
  >
  exec: (
    op:
      | { op: 'snapshot' }
      | { op: 'click'; ref: string }
      | { op: 'type'; ref: string; text: string }
      | { op: 'screenshot' },
  ) => Promise<
    | { ok: true; result: { url?: string; title?: string; yaml?: string; pngBase64?: string } }
    | { ok: false; error: string }
  >
  terminalRead: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  shellRun: (input: {
    command: string
    cwd?: string
    timeoutMs?: number
    tabId?: string
  }) => Promise<
    | { ok: true; tabId: string; exitCode: number; output: string }
    | { ok: false; error: string }
  >
}

function textResult(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj) }] }
}

export function registerBrowserTools(server: McpServer, deps: BrowserToolDeps): void {
  server.tool('browser_navigate', BROWSER_NAVIGATE_DESC, { url: z.string() }, async ({ url }) => {
    const host = hostFromUrl(url)
    if (!host) return textResult({ ok: false, error: 'nav-failed' })
    if (deps.hasSiteAskOpen()) return textResult({ ok: false, error: 'site-ask-open' })
    if (deps.isHumanControlHeld()) return textResult({ ok: false, error: 'human-control-held' })
    const r = await deps.navigateWithGate(url)
    return textResult(r)
  })

  server.tool('browser_snapshot', BROWSER_SNAPSHOT_DESC, {}, async () => {
    if (deps.isHumanControlHeld()) return textResult({ ok: false, error: 'human-control-held' })
    const r = await deps.exec({ op: 'snapshot' })
    return textResult(r)
  })

  server.tool('browser_click', BROWSER_CLICK_DESC, { ref: z.string() }, async ({ ref }) => {
    if (deps.isHumanControlHeld()) return textResult({ ok: false, error: 'human-control-held' })
    if (deps.hasSiteAskOpen()) return textResult({ ok: false, error: 'site-ask-open' })
    const r = await deps.exec({ op: 'click', ref })
    return textResult(r)
  })

  server.tool(
    'browser_type',
    BROWSER_TYPE_DESC,
    { ref: z.string(), text: z.string() },
    async ({ ref, text }) => {
      if (deps.isHumanControlHeld()) return textResult({ ok: false, error: 'human-control-held' })
      const r = await deps.exec({ op: 'type', ref, text })
      return textResult(r)
    },
  )

  server.tool('browser_screenshot', BROWSER_SCREENSHOT_DESC, {}, async () => {
    if (deps.isHumanControlHeld()) {
      return textResult({ ok: false, error: 'human-control-held' })
    }
    const r = await deps.exec({ op: 'screenshot' })
    if (!r.ok) return textResult(r)
    const png = r.result.pngBase64 ?? ''
    return {
      content: [{ type: 'image' as const, data: png, mimeType: 'image/png' }],
    }
  })

  server.tool('terminal_read', TERMINAL_READ_DESC, {}, async () => {
    const r = await deps.terminalRead()
    return textResult(r)
  })

  server.tool(
    'shell_run',
    SHELL_RUN_DESC,
    {
      command: z.string(),
      cwd: z.string().optional(),
      timeoutMs: z.number().optional(),
      tabId: z.string().optional(),
    },
    async (input) => {
      const r = await deps.shellRun(input)
      if (!r.ok) return textResult(r)
      const output = r.output.length > 32_000 ? r.output.slice(-32_000) : r.output
      return textResult({ exitCode: r.exitCode, tabId: r.tabId, output })
    },
  )
}

// re-export for tests that assert host gate without round-tripping MCP
export { hostAllowed, hostFromUrl }
