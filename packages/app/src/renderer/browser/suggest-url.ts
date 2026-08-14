/** Pick navigate target: history hit if any, else Google search. */
export function resolveAddressBar(q: string, historyUrls: string[]): string {
  const trimmed = q.trim()
  if (!trimmed) return 'about:blank'
  const lower = trimmed.toLowerCase()
  const hit = historyUrls.find((u) => u.toLowerCase().includes(lower))
  if (hit) return hit
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

/** Newest-first, last 20 substring matches (plan §6). */
export function filterHistorySuggestions(q: string, entries: Array<{ url: string; ts: number }>): string[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return []
  const sorted = [...entries].sort((a, b) => b.ts - a.ts)
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of sorted) {
    if (!e.url.toLowerCase().includes(needle)) continue
    if (seen.has(e.url)) continue
    seen.add(e.url)
    out.push(e.url)
    if (out.length >= 20) break
  }
  return out
}
