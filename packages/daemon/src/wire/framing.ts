export function encodeFrame(obj: unknown): string {
  return JSON.stringify(obj)
}

export function decodeFrame(
  raw: string,
): { ok: true; value: unknown } | { ok: false; id: string | null } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false, id: null }
  }
}
