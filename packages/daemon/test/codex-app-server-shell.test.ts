import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@openbot/protocol'
import { codexItemToolName, runCodexTurn } from '../src/codex/adapter.js'
import { assertSafeCodexArgv, buildAppServerArgv } from '../src/codex/exec-argv.js'
import { buildCodexConfigToml } from '../src/codex/config.js'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/codex')
const FIXTURE = 'app-server-command-execution.jsonl'
const MARKER = 'openbot-appserver-shell-ok'

function loadAppServerShellFixture(): string {
  const p = path.join(fixtureDir, FIXTURE)
  expect(fs.existsSync(p), `missing fixture ${FIXTURE}`).toBe(true)
  return fs.readFileSync(p, 'utf8')
}

function parseOutboundLines(raw: string): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const payload = trimmed.startsWith('<< ') ? trimmed.slice(3) : trimmed
    try {
      lines.push(JSON.parse(payload) as Record<string, unknown>)
    } catch {
      /* skip non-JSON transcript chrome */
    }
  }
  return lines
}

describe('codex app-server commandExecution (shipped path shape)', () => {
  it('fixture contains literal camelCase commandExecution', () => {
    const raw = loadAppServerShellFixture()
    expect(raw).toContain('"type":"commandExecution"')
    expect(raw).toContain('"aggregatedOutput"')
    expect(raw).toContain(MARKER)
  })

  it('default config omits shell_tool=false; app-server argv passes assertSafeCodexArgv', () => {
    const toml = buildCodexConfigToml({
      agentId: 'a',
      mcpToken: 'tok',
      mcpPort: 8799,
      hindsightPort: 8888,
      memoryBankId: 'bank',
      home: '/tmp/openbot-home',
      otherAgentDirs: [],
    })
    expect(toml).not.toContain('shell_tool = false')
    const argv = buildAppServerArgv({ effort: 'low' })
    expect(() => assertSafeCodexArgv(argv)).not.toThrow()
    expect(argv).not.toContain('--sandbox')
  })

  it('codexItemToolName maps commandExecution to Bash', () => {
    expect(codexItemToolName({ type: 'commandExecution' })).toBe('Bash')
  })

  it('runCodexTurn maps fixture commandExecution to Bash tool-use + tool-result', async () => {
    const raw = loadAppServerShellFixture()
    expect(raw).toContain('"type":"commandExecution"')
    const notifications = parseOutboundLines(raw).filter(
      (m) => typeof m.method === 'string' && !('id' in m && 'result' in m),
    )
    const completed = notifications.find((m) => {
      if (m.method !== 'item/completed') return false
      const item = (m.params as { item?: Record<string, unknown> } | undefined)?.item
      return item?.type === 'commandExecution'
    })
    expect(completed).toBeTruthy()
    const item = (completed!.params as { item: Record<string, unknown> }).item
    expect(String(item.command)).toContain(MARKER)
    expect(String(item.aggregatedOutput)).toContain(MARKER)

    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-appserver-shell-'))
    const shared = path.join(root, 'codex-home')
    const agentHome = path.join(root, 'private', 'ada', 'codex-home')
    const cwd = path.join(root, 'agents', 'ada', 'workspace')
    await fsp.mkdir(shared, { recursive: true })
    await fsp.mkdir(cwd, { recursive: true })
    await fsp.writeFile(path.join(shared, 'auth.json'), '{"v":1}', 'utf8')

    const queued: string[] = []
    const waiters: Array<(l: string) => void> = []
    let stdinBuf = ''
    const stdout = new Readable({ read() {} })
    const stderr = new Readable({ read() {} })
    const stdin = new Writable({
      write(chunk, _enc, cb) {
        stdinBuf += String(chunk)
        while (stdinBuf.includes('\n')) {
          const i = stdinBuf.indexOf('\n')
          const line = stdinBuf.slice(0, i)
          stdinBuf = stdinBuf.slice(i + 1)
          const w = waiters.shift()
          if (w) w(line)
          else queued.push(line)
        }
        cb()
      },
    })
    async function* stdinLines() {
      for (;;) {
        if (queued.length) {
          yield queued.shift()!
          continue
        }
        yield await new Promise<string>((r) => waiters.push(r))
      }
    }
    const ee = new EventEmitter() as EventEmitter & {
      pid: number
      stdin: Writable
      stdout: Readable
      stderr: Readable
      exitCode: number | null
      kill: () => boolean
    }
    ee.pid = 9001
    ee.stdin = stdin
    ee.stdout = stdout
    ee.stderr = stderr
    ee.exitCode = null
    ee.kill = () => {
      ee.exitCode = 0
      ee.emit('exit', 0)
      return true
    }

    const events: HarnessEvent[] = []
    void (async () => {
      for await (const line of stdinLines()) {
        const msg = JSON.parse(line) as { id?: number; method?: string }
        const write = (o: object) => stdout.push(Buffer.from(JSON.stringify(o) + '\n'))
        if (msg.method === 'initialize') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} })
        } else if (msg.method === 'thread/start') {
          write({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: 'thread-shell' } } })
        } else if (msg.method === 'turn/start') {
          write({
            jsonrpc: '2.0',
            id: msg.id,
            result: { turn: { id: 'turn-shell', status: 'inProgress' } },
          })
          for (const n of notifications) {
            write(n)
          }
          write({
            method: 'turn/completed',
            params: { turn: { id: 'turn-shell', status: 'completed' } },
          })
          const authPath = path.join(agentHome, 'auth.json')
          const authTmp = authPath + '.tmp'
          await fsp.writeFile(authTmp, '{"v":2}', 'utf8')
          await fsp.rename(authTmp, authPath)
          ee.exitCode = 0
          ee.emit('exit', 0)
          break
        }
      }
    })()

    const handle = runCodexTurn({
      promptText: `echo ${MARKER}`,
      cwd,
      model: 'gpt-5.6-luna',
      effort: 'low',
      sessionId: null,
      memoryAppend: 'shell',
      agentCodexHome: agentHome,
      sharedCodexHome: shared,
      config: {
        agentId: 'a1',
        mcpToken: 't',
        mcpPort: 1,
        hindsightPort: 2,
        memoryBankId: 'bank',
        home: root,
        otherAgentDirs: [],
      },
      onEvent: async (ev) => {
        events.push(ev)
      },
      onAsk: async () => 'cancelled',
      spawnFn: ((cmd: string, args: string[]) => {
        expect(cmd).toBe('codex')
        expect(args[0]).toBe('app-server')
        expect(args).not.toContain('--sandbox')
        assertSafeCodexArgv(args)
        return ee as never
      }) as unknown as typeof import('node:child_process').spawn,
    })

    const result = await handle.done
    expect(result.outcome).toBe('complete')

    const toolUse = events.find((e) => e.kind === 'tool-use')
    const toolResult = events.find((e) => e.kind === 'tool-result')
    expect(toolUse).toMatchObject({
      kind: 'tool-use',
      name: 'Bash',
      callId: String(item.id),
    })
    expect(String((toolUse as { inputSummary?: string }).inputSummary)).toContain(MARKER)
    expect(toolResult).toMatchObject({
      kind: 'tool-result',
      name: 'Bash',
      callId: String(item.id),
      ok: true,
    })
    expect(String((toolResult as { outputSummary?: string }).outputSummary)).toContain(MARKER)
  }, 10_000)
})
