import { describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { decodeFrame, encodeFrame } from '../src/wire/framing.js'
import { connect, request, startTestDaemon } from './helpers.js'

describe('ws', () => {
  it('bad token closes', async () => {
    const { daemon, port } = await startTestDaemon()
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=bad`)
      ws.on('close', () => resolve())
    })
    await daemon.stop()
  })

  it('after older than ring → replayReset', async () => {
    const { daemon, adminToken, port } = await startTestDaemon()
    const ws = await connect(port, adminToken)
    await request(ws, { type: 'agent.create', name: 'Ada' })
    const meta: unknown[] = []
    ws.on('message', (d) => {
      const v = decodeFrame(String(d))
      if (v.ok) meta.push(v.value)
    })
    ws.send(encodeFrame({ id: '1', type: 'event.stream', after: 0 }))
    // after greater than max
    await new Promise((r) => setTimeout(r, 50))
    ws.send(encodeFrame({ id: '2', type: 'event.stream', after: 999999 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(meta.some((m) => (m as { replayReset?: boolean }).replayReset === true)).toBe(true)
    await daemon.stop()
    ws.close()
  })
})
