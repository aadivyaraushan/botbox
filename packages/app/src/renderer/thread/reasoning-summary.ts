/** Collapsed reasoning label: first 80 chars, or Thought when empty. */
export function reasoningSummary(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return 'Thought'
  if (trimmed.length <= 80) return trimmed
  return trimmed.slice(0, 80)
}
