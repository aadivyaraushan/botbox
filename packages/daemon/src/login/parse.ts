export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '')
}

function tryParseUrl(chunk: string): string | null {
  const match = chunk.match(/https?:\/\/[^\s>]+/)
  if (!match) return null
  const raw = match[0]!.replace(/[>\],.)'"]+$/g, '')
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

export function parseClaudeLoginUrl(stdout: string): string | null {
  const cleaned = stripAnsi(stdout)
  const lines = cleaned.split(/\r?\n/).map((l) => l.trimEnd())

  // Prefer a complete URL on a single line (avoids gluing "Paste code here" onto state=).
  for (const line of lines) {
    const got = tryParseUrl(line)
    if (got) return got
  }

  // Wrapped URLs: only join continuation lines while the buffer ends with a URL connector.
  let buf = ''
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/https?:\/\//.test(trimmed)) {
      if (buf) {
        const got = tryParseUrl(buf)
        if (got) return got
      }
      buf = trimmed
      continue
    }
    if (buf && /[&=?/]$/.test(buf.trim()) && /^[a-zA-Z0-9_=&%+./?:#-]+$/.test(trimmed)) {
      buf += trimmed
      continue
    }
    if (buf) {
      const got = tryParseUrl(buf)
      if (got) return got
      buf = ''
    }
  }
  return buf ? tryParseUrl(buf) : null
}

export function parseCodexDeviceAuth(stdout: string): { url: string; userCode: string } | null {
  const cleaned = stripAnsi(stdout)
  const lines = cleaned.split(/\r?\n/)
  let url: string | null = null
  let userCode: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const m = line.match(/https?:\/\/\S*codex\/device\S*/)
    if (m) {
      try {
        url = new URL(m[0]!.replace(/[\])>,.]+$/, '')).toString()
      } catch {
        /* ignore */
      }
    }
    if (/one-time code/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const code = lines[j]!.trim()
        if (/^[A-Z0-9][A-Z0-9-]+$/.test(code)) {
          userCode = code
          break
        }
      }
    }
  }
  if (!url || !userCode) return null
  return { url, userCode }
}
