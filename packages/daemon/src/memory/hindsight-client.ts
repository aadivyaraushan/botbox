export type HindsightClientOptions = {
  baseUrl: string
  fetchFn?: typeof fetch
}

export type RetainResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; error: string }

export type RecallResult =
  | { ok: true; results: Array<{ text: string }> }
  | { ok: false; status: number; error: string }

export type DeleteBankResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string }

export class HindsightClient {
  readonly baseUrl: string
  private fetchFn: typeof fetch

  constructor(opts: HindsightClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.fetchFn = opts.fetchFn ?? fetch
  }

  async retain(bankId: string, content: string): Promise<RetainResult> {
    const url = `${this.baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/memories`
    const body = { items: [{ content }] }
    let res: Response
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (e) {
      return { ok: false, status: 0, error: String(e) }
    }
    if (res.status === 404) {
      const put = await this.createBank(bankId)
      if (!put.ok) return put
      try {
        res = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch (e) {
        return { ok: false, status: 0, error: String(e) }
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
    }
    return { ok: true, status: res.status, body: await res.json().catch(() => null) }
  }

  async createBank(bankId: string): Promise<RetainResult> {
    const url = `${this.baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}`
    try {
      const res = await this.fetchFn(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
      }
      return { ok: true, status: res.status, body: null }
    } catch (e) {
      return { ok: false, status: 0, error: String(e) }
    }
  }

  async recall(bankId: string, query: string, maxTokens: number): Promise<RecallResult> {
    const url = `${this.baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/memories/recall`
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, max_tokens: maxTokens }),
      })
      if (!res.ok) {
        return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
      }
      const json = (await res.json()) as { results?: Array<{ text?: string }> }
      const results = (json.results ?? []).map((r) => ({ text: r.text ?? '' }))
      return { ok: true, results }
    } catch (e) {
      return { ok: false, status: 0, error: String(e) }
    }
  }

  async deleteBank(bankId: string): Promise<DeleteBankResult> {
    const url = `${this.baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}`
    try {
      const res = await this.fetchFn(url, { method: 'DELETE' })
      if (res.status === 404) return { ok: true, status: 404 }
      if (!res.ok) {
        return { ok: false, status: res.status, error: await res.text().catch(() => res.statusText) }
      }
      return { ok: true, status: res.status }
    } catch (e) {
      return { ok: false, status: 0, error: String(e) }
    }
  }
}
