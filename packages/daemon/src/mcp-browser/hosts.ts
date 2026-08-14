/** Full hostname match: entry matches host or www-style suffix. No public-suffix reduction. */
export function normalizeHost(raw: string): string {
  let h = raw.trim().toLowerCase()
  if (h.endsWith('.')) h = h.slice(0, -1)
  const colon = h.indexOf(':')
  if (colon > 0 && !h.includes(']')) h = h.slice(0, colon)
  return h
}

export function hostAllowed(host: string, allowedHosts: string[]): boolean {
  const h = normalizeHost(host)
  for (const entry of allowedHosts) {
    const e = normalizeHost(entry)
    if (!e) continue
    if (h === e || h.endsWith('.' + e)) return true
  }
  return false
}

export function hostFromUrl(url: string): string | null {
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return null
  }
}
