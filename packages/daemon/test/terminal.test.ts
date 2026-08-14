import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import { encodeFrame, decodeFrame } from '../src/wire/framing.js'
import { SHELL_RUN_DESC, TERMINAL_READ_DESC } from '../src/mcp-browser/tools.js'
import { connect, fakeQueryStream, makeFakeFetch, request, tempHome, type FakeMemory } from './helpers.js'
import type { RawData } from 'ws'

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

describe('terminal', () => {
  it('pins terminal_read and shell_run descriptions', () => {
    expect(TERMINAL_READ_DESC).toContain('most recently written')
    expect(SHELL_RUN_DESC).toContain('Never steals focus')
  })

  it('terminal_read with no tabs → no-terminal; buffer ≤8000', async () => {
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
      agent: { id: string }
    }
    const tok = daemon.getMcpToken(a.agent.id)!

    const onMsg = (data: RawData) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.type === 'terminal.read') {
        ws.send(encodeFrame({ id: v.id, type: 'response', ok: false, error: 'no-terminal' }))
      }
    }
    ws.on('message', onMsg)

    const empty = (await mcpCall(port, a.agent.id, tok, 'terminal_read', {})) as {
      ok: boolean
      error?: string
    }
    expect(empty).toEqual({ ok: false, error: 'no-terminal' })

    ws.off('message', onMsg)
    const big = 'x'.repeat(9000)
    ws.on('message', (data) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.type === 'terminal.read') {
        ws.send(
          encodeFrame({
            id: v.id,
            type: 'response',
            ok: true,
            text: big.slice(-8000),
          }),
        )
      }
    })
    const withBuf = (await mcpCall(port, a.agent.id, tok, 'terminal_read', {})) as {
      ok: boolean
      text: string
    }
    expect(withBuf.ok).toBe(true)
    expect(withBuf.text.length).toBeLessThanOrEqual(8000)

    await daemon.stop()
    ws.close()
  })

  it('shell_run never steals focus; write-denied and timeout', async () => {
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
      agent: { id: string }
    }
    const b = (await request(ws, { type: 'agent.create', name: 'Bea' })) as {
      agent: { id: string; slug: string }
    }
    const beaDir = path.join(home, 'agents', b.agent.slug)
    await fs.promises.mkdir(beaDir, { recursive: true })
    const tok = daemon.getMcpToken(a.agent.id)!

    const runs: Array<Record<string, unknown>> = []
    ws.on('message', (data) => {
      const decoded = decodeFrame(String(data))
      if (!decoded.ok) return
      const v = decoded.value as Record<string, unknown>
      if (v.type === 'terminal.run') {
        runs.push(v)
        expect(v.stealFocus).toBe(false)
        if (String(v.command).includes('TIMEOUT')) {
          ws.send(encodeFrame({ id: v.id, type: 'response', ok: false, error: 'timeout' }))
        } else {
          ws.send(
            encodeFrame({
              id: v.id,
              type: 'response',
              ok: true,
              tabId: 't1',
              exitCode: 0,
              output: 'prompt% ',
            }),
          )
        }
      }
    })

    const ok = (await mcpCall(port, a.agent.id, tok, 'shell_run', {
      command: 'echo hi',
    })) as { exitCode: number; tabId: string; output: string }
    expect(ok.exitCode).toBe(0)
    expect(ok.tabId).toBe('t1')
    expect(runs[0]?.stealFocus).toBe(false)

    const denied = (await mcpCall(port, a.agent.id, tok, 'shell_run', {
      command: `echo x >> ${path.join(beaDir, 'MEMORY.md')}`,
    })) as { ok: boolean; error?: string }
    expect(denied.ok).toBe(false)
    expect(denied.error).toBe('write-denied')

    const timed = (await mcpCall(port, a.agent.id, tok, 'shell_run', {
      command: 'TIMEOUT',
    })) as { ok: boolean; error?: string }
    expect(timed.ok).toBe(false)
    expect(timed.error).toBe('timeout')

    await daemon.stop()
    ws.close()
  })
})
