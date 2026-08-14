import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import { encodeFrame, decodeFrame } from '../src/wire/framing.js'
import {
  BROWSER_CLICK_DESC,
  BROWSER_NAVIGATE_DESC,
  BROWSER_SCREENSHOT_DESC,
  BROWSER_SNAPSHOT_DESC,
  BROWSER_TYPE_DESC,
} from '../src/mcp-browser/tools.js'
import { hostAllowed } from '../src/mcp-browser/hosts.js'
import { connect, fakeQueryStream, makeFakeFetch, request, tempHome, type FakeMemory } from './helpers.js'

async function mcpCall(
  port: number,
  agentId: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const initBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  }
  await fetch(`http://127.0.0.1:${port}/mcp/${agentId}?token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(initBody),
  })
  const r = await fetch(`http://127.0.0.1:${port}/mcp/${agentId}?token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
  const text = await r.text()
  const dataLine = text.split('\n').find((l) => l.startsWith('data: '))
  const json = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(text)
  const content = json.result?.content?.[0]?.text
  return content ? JSON.parse(content) : json
}

describe('browser-gate', () => {
  it('pins five browser MCP description strings', () => {
    expect(BROWSER_NAVIGATE_DESC).toContain('in-app browser')
    expect(BROWSER_SNAPSHOT_DESC).toContain('ref (e1, e2')
    expect(BROWSER_CLICK_DESC).toContain('last snapshot')
    expect(BROWSER_TYPE_DESC).toContain('Pass its ref and the text')
    expect(BROWSER_SCREENSHOT_DESC).toContain('PNG')
  })

  it('hostAllowed matches suffix, not notexample.com', () => {
    expect(hostAllowed('www.example.com', ['example.com'])).toBe(true)
    expect(hostAllowed('example.com', ['example.com'])).toBe(true)
    expect(hostAllowed('notexample.com', ['example.com'])).toBe(false)
  })

  it('browser_navigate to a new host does not call browser.exec and pushes needs-site', async () => {
    const home = await tempHome()
    await fs.promises.mkdir(path.join(home, 'claude-config'), { recursive: true })
    await fs.promises.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const adminToken = randomBytes(32).toString('hex')
    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      queryFn: fakeQueryStream([
        { type: 'system', subtype: 'init', session_id: 's' },
        { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0 },
      ]),
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const execCalls: unknown[] = []
    ws.on('message', (data) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.type === 'browser.exec') {
        execCalls.push(v)
        ws.send(
          encodeFrame({
            id: v.id,
            type: 'response',
            ok: false,
            error: 'op-failed',
          }),
        )
      }
    })
    const a = (await request(ws, { type: 'agent.create', name: 'Ada' })) as {
      agent: { id: string }
    }
    const tok = daemon.getMcpToken(a.agent.id)!

    const navP = mcpCall(port, a.agent.id, tok, 'browser_navigate', {
      url: 'https://example.com/',
    })
    await new Promise((r) => setTimeout(r, 100))
    expect(execCalls).toHaveLength(0)
    const list = (await request(ws, { type: 'agent.get', agentId: a.agent.id })) as {
      banners: Array<{ type: string; host?: string }>
    }
    expect(list.banners.some((b) => b.type === 'needs-site' && b.host === 'example.com')).toBe(true)

    await request(ws, {
      type: 'browser.allowSite',
      agentId: a.agent.id,
      host: 'example.com',
      allow: true,
    })
    await new Promise((r) => setTimeout(r, 80))
    expect(execCalls.length).toBeGreaterThanOrEqual(1)
    const first = execCalls[0] as { op: string; url: string }
    expect(first.op).toBe('navigate')
    expect(first.url).toContain('example.com')
    await navP
    await daemon.stop()
    ws.close()
  })

  it('cross-site app response stores pending navigate not click replay', async () => {
    const home = await tempHome()
    await fs.promises.mkdir(path.join(home, 'claude-config'), { recursive: true })
    await fs.promises.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
    const mem: FakeMemory = { banks: new Map(), calls: [] }
    const fetchFn = makeFakeFetch(mem)
    const adminToken = randomBytes(32).toString('hex')
    const daemon = new Daemon({
      home,
      adminToken,
      port: 0,
      skipHindsightSpawn: true,
      fetchFn,
      queryFn: fakeQueryStream([
        { type: 'system', subtype: 'init', session_id: 's' },
        { type: 'result', subtype: 'success', session_id: 's', total_cost_usd: 0 },
      ]),
    })
    daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
    const { port } = await daemon.start()
    const ws = await connect(port, adminToken)
    const a = (await request(ws, { type: 'agent.create', name: 'Ada' })) as {
      agent: { id: string; slug: string }
    }
    const allowPath = path.join(home, 'private', a.agent.slug, 'browser-allow.json')
    await fs.promises.mkdir(path.dirname(allowPath), { recursive: true })
    await fs.promises.writeFile(allowPath, JSON.stringify(['example.com']))

    const execLog: Array<Record<string, unknown>> = []
    ws.on('message', (data) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.type === 'browser.exec') {
        execLog.push(v)
        if (v.op === 'click') {
          ws.send(
            encodeFrame({
              id: v.id,
              type: 'response',
              ok: false,
              error: 'cross-site',
              url: 'https://other.com/x',
              host: 'other.com',
            }),
          )
        } else if (v.op === 'navigate') {
          ws.send(
            encodeFrame({
              id: v.id,
              type: 'response',
              ok: true,
              result: { url: String(v.url), title: 't' },
            }),
          )
        }
      }
    })

    const tok = daemon.getMcpToken(a.agent.id)!
    const clickP = mcpCall(port, a.agent.id, tok, 'browser_click', { ref: 'e1' })
    await new Promise((r) => setTimeout(r, 80))
    const get = (await request(ws, { type: 'agent.get', agentId: a.agent.id })) as {
      banners: Array<{ type: string; host?: string }>
    }
    expect(get.banners.some((b) => b.type === 'needs-site' && b.host === 'other.com')).toBe(true)

    await request(ws, {
      type: 'browser.allowSite',
      agentId: a.agent.id,
      host: 'other.com',
      allow: true,
    })
    await new Promise((r) => setTimeout(r, 80))
    const navs = execLog.filter((e) => e.op === 'navigate')
    expect(navs.some((n) => String(n.url).includes('other.com'))).toBe(true)
    expect(execLog.filter((e) => e.op === 'click')).toHaveLength(1)
    await clickP
    await daemon.stop()
    ws.close()
  })
})
