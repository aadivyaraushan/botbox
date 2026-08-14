import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import { encodeFrame, decodeFrame } from '../src/wire/framing.js'
import type { QueryFn } from '../src/claude/adapter.js'

export async function tempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openbot-m1-'))
  return dir
}

export type FakeMemory = {
  banks: Map<string, string[]>
  calls: Array<{ method: string; url: string; body?: unknown }>
  failDelete?: boolean
  failRetain?: boolean
  failRecall?: boolean
  retain404Once?: Set<string>
}

export function makeFakeFetch(mem: FakeMemory): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    let body: unknown
    if (init?.body) body = JSON.parse(String(init.body))
    mem.calls.push({ method, url, body })

    const bankMatch = url.match(/\/banks\/([^/]+)/)
    const bankId = bankMatch ? decodeURIComponent(bankMatch[1]!) : ''

    if (method === 'DELETE' && /\/banks\/[^/]+$/.test(url)) {
      if (mem.failDelete) return new Response('down', { status: 500 })
      if (!mem.banks.has(bankId)) return new Response('', { status: 404 })
      mem.banks.delete(bankId)
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (method === 'PUT' && /\/banks\/[^/]+$/.test(url)) {
      mem.banks.set(bankId, mem.banks.get(bankId) ?? [])
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    if (method === 'POST' && url.includes('/memories/recall')) {
      if (mem.failRecall) return new Response('fail', { status: 500 })
      const items = mem.banks.get(bankId) ?? []
      return new Response(
        JSON.stringify({ results: items.map((t) => ({ text: t })) }),
        { status: 200 },
      )
    }
    if (method === 'POST' && url.endsWith('/memories')) {
      if (mem.failRetain) return new Response('fail', { status: 500 })
      if (mem.retain404Once?.has(bankId)) {
        mem.retain404Once.delete(bankId)
        return new Response('missing', { status: 404 })
      }
      if (!mem.banks.has(bankId)) return new Response('missing', { status: 404 })
      const content = (body as { items: Array<{ content: string }> }).items[0]!.content
      mem.banks.get(bankId)!.push(content)
      return new Response(JSON.stringify({ success: true, bank_id: bankId }), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }
}

export function fakeQueryStream(
  messages: Array<Record<string, unknown>>,
  opts?: { record?: Array<unknown>; delayMs?: number },
): QueryFn {
  return ((args: { prompt: unknown; options: Record<string, unknown> }) => {
    opts?.record?.push(args)
    const q = {
      async interrupt() {},
      async *[Symbol.asyncIterator]() {
        for (const m of messages) {
          if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
          yield m
        }
      },
    }
    return q as ReturnType<QueryFn>
  }) as QueryFn
}

export async function startTestDaemon(opts?: {
  queryFn?: QueryFn
  mem?: FakeMemory
  spawnHindsightFn?: Daemon extends never ? never : ConstructorParameters<typeof Daemon>[0]['spawnHindsightFn']
  resourcePath?: string
  skipHindsightSpawn?: boolean
}) {
  const home = await tempHome()
  const adminToken = randomBytes(32).toString('hex')
  const mem: FakeMemory = opts?.mem ?? { banks: new Map(), calls: [] }
  const fetchFn = makeFakeFetch(mem)
  const daemon = new Daemon({
    home,
    adminToken,
    port: 0,
    queryFn: opts?.queryFn ?? fakeQueryStream([
      { type: 'system', subtype: 'init', session_id: 'sess-1' },
      {
        type: 'stream_event',
        event: { type: 'message_start' },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'hmm' },
        },
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: 'hello' },
        },
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'sess-1',
        total_cost_usd: 0.01,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    ]),
    fetchFn,
    skipHindsightSpawn: opts?.skipHindsightSpawn ?? true,
    hindsightPort: 8888,
    resourcePath: opts?.resourcePath,
    spawnHindsightFn: opts?.spawnHindsightFn,
  })
  daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
  const { port } = await daemon.start()
  return { daemon, home, adminToken, port, mem }
}

export function connect(port: number, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

export async function request(
  ws: WebSocket,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = randomUUID()
  const msg = { id, ...body }
  return await new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.id === id && v.type === 'response') {
        ws.off('message', onMsg)
        resolve(v)
      }
    }
    ws.on('message', onMsg)
    ws.send(encodeFrame(msg))
    setTimeout(() => reject(new Error('request timeout ' + body.type)), 15_000)
  })
}

export function collectEvents(ws: WebSocket, ms = 50): Promise<unknown[]> {
  const events: unknown[] = []
  const onMsg = (data: WebSocket.RawData) => {
    const decoded = decodeFrame(String(data))
    if (decoded.ok) events.push(decoded.value)
  }
  ws.on('message', onMsg)
  return new Promise((resolve) =>
    setTimeout(() => {
      ws.off('message', onMsg)
      resolve(events)
    }, ms),
  )
}
