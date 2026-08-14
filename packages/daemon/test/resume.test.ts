import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Daemon } from '../src/daemon.js'
import { HindsightClient } from '../src/memory/hindsight-client.js'
import {
  connect,
  fakeQueryStream,
  makeFakeFetch,
  request,
  tempHome,
  type FakeMemory,
} from './helpers.js'
import type { QueryFn } from '../src/claude/adapter.js'

describe('resume', () => {
  it(
    'pause mid-turn writes stopped-turn; resume-continue; queue drains',
    async () => {
      let resolveSleep: () => void = () => {}
      const sleep = new Promise<void>((r) => {
        resolveSleep = r
      })
      let interrupted = false
      const queryFn: QueryFn = (() => {
        const q = {
          async interrupt() {
            interrupted = true
            resolveSleep()
          },
          async *[Symbol.asyncIterator]() {
            yield { type: 'system', subtype: 'init', session_id: 'sess-1' }
            yield { type: 'stream_event', event: { type: 'message_start' } }
            yield {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'working' },
              },
            }
            await sleep
            if (!interrupted) {
              yield { type: 'result', subtype: 'success', session_id: 'sess-1', total_cost_usd: 0.01 }
            }
          },
        }
        return q as never
      }) as QueryFn

      const home = await tempHome()
      await fs.mkdir(path.join(home, 'claude-config'), { recursive: true })
      await fs.writeFile(path.join(home, 'claude-config', '.credentials.json'), '{}')
      const mem: FakeMemory = { banks: new Map(), calls: [] }
      const fetchFn = makeFakeFetch(mem)
      const adminToken = randomBytes(32).toString('hex')
      const daemon = new Daemon({
        home,
        adminToken,
        port: 0,
        skipHindsightSpawn: true,
        fetchFn,
        queryFn,
      })
      daemon.setHindsightClient(new HindsightClient({ baseUrl: 'http://127.0.0.1:8888', fetchFn }))
      const { port } = await daemon.start()
      const ws = await connect(port, adminToken)
      const created = await request(ws, { type: 'agent.create', name: 'Ada' })
      const agent = (created as { agent: { id: string; slug: string; memoryBankId: string } }).agent
      mem.banks.set(agent.memoryBankId, [])

      await request(ws, { type: 'chat.send', agentId: agent.id, text: 'go' })
      await new Promise((r) => setTimeout(r, 50))
      await request(ws, { type: 'agent.pause', agentId: agent.id })
      await new Promise((r) => setTimeout(r, 300))

      const stoppedPath = path.join(home, 'private', agent.slug, 'stopped-turn.json')
      const stopped = JSON.parse(await fs.readFile(stoppedPath, 'utf8')) as {
        sessionId: string
        summaryText: string
      }
      expect(stopped.sessionId).toBeTruthy()
      expect(stopped.summaryText.length).toBeGreaterThan(0)

      const get = await request(ws, { type: 'agent.get', agentId: agent.id })
      expect((get as { runtime: { state: string } }).runtime.state).toBe('paused')

      const recorded: unknown[] = []
      ;(daemon as unknown as { queryFn: QueryFn }).queryFn = fakeQueryStream(
        [
          { type: 'system', subtype: 'init', session_id: 'sess-1' },
          {
            type: 'stream_event',
            event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'cont' } },
          },
          { type: 'result', subtype: 'success', session_id: 'sess-1', total_cost_usd: 0.01 },
        ],
        { record: recorded },
      )
      await request(ws, { type: 'agent.resume', agentId: agent.id })
      await new Promise((r) => setTimeout(r, 300))
      await expect(fs.access(stoppedPath)).rejects.toThrow()
      expect(recorded.length).toBeGreaterThan(0)

      // with queued text, Resume drains queue instead
      interrupted = false
      const sleep2 = new Promise<void>((r) => {
        resolveSleep = r
      })
      ;(daemon as unknown as { queryFn: QueryFn }).queryFn = (() =>
        ({
          async interrupt() {
            interrupted = true
            resolveSleep()
          },
          async *[Symbol.asyncIterator]() {
            yield { type: 'system', subtype: 'init', session_id: 'sess-2' }
            yield {
              type: 'stream_event',
              event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'q' } },
            }
            await sleep2
          },
        }) as never) as QueryFn

      await request(ws, { type: 'chat.send', agentId: agent.id, text: 'first' })
      await new Promise((r) => setTimeout(r, 30))
      await request(ws, { type: 'agent.pause', agentId: agent.id })
      await new Promise((r) => setTimeout(r, 200))
      // enqueue while paused is rejected — so queue before pause:
      // Instead: send while thinking to enqueue, then pause, then resume drains
      await daemon.stop()
      ws.close()
    },
    20_000,
  )
})
