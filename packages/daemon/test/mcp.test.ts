import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import { connect, fakeQueryStream, makeFakeFetch, request, tempHome, type FakeMemory } from './helpers.js'
import { LIST_AGENTS_DESC, MESSAGE_AGENT_DESC } from '../src/mcp/peer-tools.js'

describe('mcp', () => {
  it('token checks, no mcp-tokens.json, sequential initialize 200', async () => {
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
    expect(fs.existsSync(path.join(home, 'mcp-tokens.json'))).toBe(false)

    const ws = await connect(port, adminToken)
    const a = (await request(ws, { type: 'agent.create', name: 'Ada' })) as { agent: { id: string } }
    const b = (await request(ws, { type: 'agent.create', name: 'Bea' })) as { agent: { id: string } }
    const adaTok = daemon.getMcpToken(a.agent.id)!
    const beaTok = daemon.getMcpToken(b.agent.id)!

    // Ada token on Bea path → 401
    const bad = await fetch(`http://127.0.0.1:${port}/mcp/${b.agent.id}?token=${adaTok}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(bad.status).toBe(401)

    // admin token on /mcp/ → 401
    const admin = await fetch(`http://127.0.0.1:${port}/mcp/${a.agent.id}?token=${adminToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    expect(admin.status).toBe(401)

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
    const r1 = await fetch(`http://127.0.0.1:${port}/mcp/${a.agent.id}?token=${adaTok}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(initBody),
    })
    expect(r1.status).toBe(200)
    const r2 = await fetch(`http://127.0.0.1:${port}/mcp/${a.agent.id}?token=${adaTok}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ ...initBody, id: 2 }),
    })
    expect(r2.status).toBe(200)

    expect(LIST_AGENTS_DESC).toMatch(/List the other people/)
    expect(MESSAGE_AGENT_DESC).toMatch(/Send work to another agent/)

    await daemon.stop()
    ws.close()
  })
})
