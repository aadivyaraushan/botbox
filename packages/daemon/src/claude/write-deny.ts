import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'shell-quote'

export type WriteDenyContext = {
  home: string
  cwd: string
  ownSlug: string
  otherSlugs: string[]
}

const DENY_OTHER = "Cannot write another agent's folder."
const DENY_PRIVATE = 'Cannot read OpenBot private files.'

function expandHome(p: string, _openbotHome: string): string {
  const homedir = os.homedir()
  if (p.startsWith('~/')) return path.join(homedir, p.slice(2))
  if (p === '~') return homedir
  if (p.startsWith('$HOME/')) return path.join(homedir, p.slice(6))
  if (p.startsWith('$HOME')) return path.join(homedir, p.slice(5))
  return p
}

export function resolveCandidate(candidate: string, cwd: string, home: string): string {
  const expanded = expandHome(candidate, home)
  const resolved = path.resolve(cwd, expanded)
  let cur = resolved
  const missing: string[] = []
  while (!fs.existsSync(cur)) {
    missing.unshift(path.basename(cur))
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  let real = cur
  try {
    real = fs.realpathSync(cur)
  } catch {
    real = cur
  }
  return missing.length ? path.join(real, ...missing) : real
}

function normalizePath(p: string): string {
  try {
    if (fs.existsSync(p)) return fs.realpathSync(p)
    // realpath nearest existing ancestor
    let cur = p
    const missing: string[] = []
    while (!fs.existsSync(cur)) {
      missing.unshift(path.basename(cur))
      const parent = path.dirname(cur)
      if (parent === cur) break
      cur = parent
    }
    try {
      cur = fs.realpathSync(cur)
    } catch {
      /* keep */
    }
    return missing.length ? path.join(cur, ...missing) : cur
  } catch {
    return p
  }
}

function under(dir: string, target: string): boolean {
  const d = normalizePath(dir)
  const t = normalizePath(target)
  return t === d || t.startsWith(d + path.sep)
}

function privateDenyPaths(home: string): string[] {
  return [
    path.join(home, 'private'),
    path.join(home, 'claude-config'),
    path.join(home, 'codex-home'),
    path.join(home, 'hindsight'),
    path.join(home, 'team.json'),
    path.join(home, 'login-url'),
    path.join(os.homedir(), '.pg0'),
  ]
}

function looksLikePath(s: string): boolean {
  return s.includes('/') || s.startsWith('~') || s.startsWith('.')
}

function collectStringPaths(input: Record<string, unknown>): string[] {
  const out: string[] = []
  for (const v of Object.values(input)) {
    if (typeof v === 'string' && looksLikePath(v)) out.push(v)
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const nested of Object.values(v as Record<string, unknown>)) {
        if (typeof nested === 'string' && looksLikePath(nested)) out.push(nested)
      }
    }
  }
  return out
}

function bashCandidates(command: string): string[] | 'deny-all' {
  let tokens: ReturnType<typeof parse>
  try {
    tokens = parse(command)
  } catch {
    return 'deny-all'
  }
  const stringTokens = tokens.filter((t): t is string => typeof t === 'string')
  if (stringTokens.length === 0 && tokens.length > 0) {
    // only operators / objects — still try; if no string tokens deny
  }
  if (tokens.length > 0 && stringTokens.length === 0) return 'deny-all'

  const segments: string[][] = [[]]
  for (const t of tokens) {
    if (typeof t === 'object' && t && 'op' in t) {
      const op = (t as { op: string }).op
      if (op === ';' || op === '&&' || op === '||' || op === '|') {
        segments.push([])
        continue
      }
      if (op === '>' || op === '>>') {
        // next string is redirect target — handled below by walking
        segments[segments.length - 1]!.push(`__redir__${op}`)
        continue
      }
    }
    if (typeof t === 'string') segments[segments.length - 1]!.push(t)
  }

  const cands: string[] = []
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      const tok = seg[i]!
      if (tok.startsWith('__redir__')) {
        const next = seg[i + 1]
        if (next) cands.push(next)
        continue
      }
    }
    const cmd = seg.find((s) => !s.startsWith('__redir__'))
    if (!cmd) continue
    const args = seg.filter((s) => !s.startsWith('__redir__'))
    if (cmd === 'cp' || cmd === 'mv') {
      const last = args[args.length - 1]
      if (last && last !== cmd) cands.push(last)
    }
    if (cmd === 'rm' || cmd === 'mkdir' || cmd === 'touch' || cmd === 'tee') {
      for (const a of args.slice(1)) {
        if (!a.startsWith('-')) cands.push(a)
      }
    }
  }
  return cands
}

function denyResult(reason: string) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse' as const,
      permissionDecision: 'deny' as const,
      permissionDecisionReason: reason,
    },
  }
}

export function writeDeny(
  toolName: string,
  input: Record<string, unknown>,
  ctx: WriteDenyContext,
): Record<string, unknown> {
  const home = ctx.home || os.homedir()
  const otherDirs = ctx.otherSlugs.map((s) => path.join(home, 'agents', s))
  const privatePaths = privateDenyPaths(home)
  // also deny browser-profile / claude-config / codex-home under own private
  const ownPrivate = path.join(home, 'private', ctx.ownSlug)
  const ownSensitive = [
    path.join(ownPrivate, 'browser-profile'),
    path.join(ownPrivate, 'claude-config'),
    path.join(ownPrivate, 'codex-home'),
  ]

  const readAllowTools = new Set(['Read', 'Glob', 'Grep'])

  let candidates: string[] = []
  if (toolName === 'Write' || toolName === 'Edit') {
    if (typeof input.file_path === 'string') candidates = [input.file_path]
  } else if (toolName === 'NotebookEdit') {
    if (typeof input.notebook_path === 'string') candidates = [input.notebook_path]
  } else if (toolName === 'Bash' || toolName === 'mcp__openbot__shell_run') {
    const cmd = typeof input.command === 'string' ? input.command : ''
    const parsed = bashCandidates(cmd)
    if (parsed === 'deny-all') return denyResult(DENY_OTHER)
    candidates = parsed
  } else {
    candidates = collectStringPaths(input)
  }

  for (const c of candidates) {
    const resolved = resolveCandidate(c, ctx.cwd, home)
    for (const other of otherDirs) {
      if (under(other, resolved)) {
        if (readAllowTools.has(toolName)) {
          // allowed read of other agent
        } else {
          return denyResult(DENY_OTHER)
        }
      }
    }
    for (const p of [...privatePaths, ...ownSensitive]) {
      if (under(p, resolved) || resolved === p) {
        return denyResult(DENY_PRIVATE)
      }
    }
    // team.json / login-url exact
    if (resolved === path.join(home, 'team.json') || resolved === path.join(home, 'login-url')) {
      return denyResult(DENY_PRIVATE)
    }
  }

  // Bash cat of private paths: candidates from tee/rm etc may miss `cat` — walk all string args for private
  if (toolName === 'Bash' || toolName === 'mcp__openbot__shell_run') {
    const cmd = typeof input.command === 'string' ? input.command : ''
    let tokens: ReturnType<typeof parse>
    try {
      tokens = parse(cmd)
    } catch {
      return denyResult(DENY_OTHER)
    }
    for (const t of tokens) {
      if (typeof t !== 'string') continue
      if (!looksLikePath(t)) continue
      const resolved = resolveCandidate(t, ctx.cwd, home)
      for (const p of privatePaths) {
        if (under(p, resolved) || resolved === p) return denyResult(DENY_PRIVATE)
      }
      if (!readAllowTools.has('Read')) {
        // already handled
      }
      for (const other of otherDirs) {
        // cat of other MEMORY is allowed — only writes denied via redirect extraction
      }
    }
  }

  return {}
}

export async function writeDenyHook(
  input: { tool_name?: string; tool_input?: Record<string, unknown>; hook_event_name?: string },
  _toolUseID: string,
  ctx: WriteDenyContext,
): Promise<Record<string, unknown>> {
  const toolName = input.tool_name ?? ''
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>
  return writeDeny(toolName, toolInput, ctx)
}
