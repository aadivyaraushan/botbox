import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { PassThrough, Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@openbot/protocol'
import {
  assertNoHomeDirWritableRoots,
  buildCodexConfigToml,
  writeCodexConfig,
} from '../src/codex/config.js'
import { copyAuthAgentToShared, copyAuthSharedToAgent } from '../src/codex/auth.js'
import {
  buildAskAnswerRpc,
  loadRequestUserInputFixture,
  mapRequestUserInputToAsk,
} from '../src/codex/ask.js'
import {
  assertSafeCodexArgv,
  buildAppServerArgv,
  buildCodexArgv,
  buildCodexExecArgv,
} from '../src/codex/exec-argv.js'
import { mapAskQuestions, mapExecUsage, runCodexTurn } from '../src/codex/adapter.js'
import { loadCompactPrompt, runCodexCompact } from '../src/harness/compact.js'

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures', 'codex')

describe('codex fixtures', () => {
  it('loads request-user-input fixture or throws run the probe', () => {
    const ask = loadRequestUserInputFixture()
    expect(ask.params.questions[0]?.question).toBeTruthy()
  })

  it('maps usage keys from turn-completed.jsonl exactly', () => {
    const line = fs.readFileSync(path.join(FIX, 'turn-completed.jsonl'), 'utf8').trim().split('\n').pop()!
    const usage = JSON.parse(line).usage
    expect(mapExecUsage(usage)).toEqual({
      costUsd: null,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    })
  })
})

describe('codex config.toml', () => {
  it('writes openbot profile with hindsight url and no homeDir writable_roots', async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-cfg-'))
    const agentHome = path.join(home, 'private', 'ada', 'codex-home')
    const other = path.join(home, 'agents', 'bea')
    await writeCodexConfig({
      agentCodexHome: agentHome,
      input: {
        agentId: 'agent-1',
        mcpToken: 'tok',
        mcpPort: 8799,
        hindsightPort: 9123,
        memoryBankId: 'bank-1',
        home,
        otherAgentDirs: [other],
      },
    })
    const toml = await fsp.readFile(path.join(agentHome, 'config.toml'), 'utf8')
    expect(toml).toContain('default_permissions = "openbot"')
    expect(toml).toContain('shell_tool = false')
    expect(toml).toContain(`url = "http://127.0.0.1:9123/mcp/bank-1/"`)
    expect(toml).not.toMatch(/writable_roots/)
    expect(toml).not.toContain('homeDir')
    assertNoHomeDirWritableRoots(toml)
    expect(buildCodexConfigToml({
      agentId: 'a',
      mcpToken: 't',
      mcpPort: 1,
      hindsightPort: 2,
      memoryBankId: 'b',
      home,
      otherAgentDirs: [],
    })).toContain('":root" = "write"')
  })
})

describe('codex argv', () => {
  it('app-server and compact exec flags', () => {
    expect(buildAppServerArgv()).toEqual(['app-server', '--listen', 'stdio://', '--strict-config'])
    expect(buildCodexArgv('app-server')).toEqual(['app-server', '--listen', 'stdio://', '--strict-config'])
    expect(buildAppServerArgv({ effort: 'high' })).toEqual([
      'app-server',
      '--listen',
      'stdio://',
      '--strict-config',
      '-c',
      'model_reasoning_effort=high',
    ])
    const compact = buildCodexExecArgv({
      kind: 'compact',
      prompt: 'summarize',
      model: 'gpt-5.6-luna',
      effort: 'high',
    })
    expect(compact).toContain('--strict-config')
    expect(compact).toContain('--model')
    expect(compact).toContain('model_reasoning_effort=high')
    expect(compact).not.toContain('--effort')
    expect(compact).not.toContain('--sandbox')
    assertSafeCodexArgv(compact)
  })
})

describe('codex auth copy-back', () => {
  it('shared auth matches agent auth after copy', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-auth-'))
    const shared = path.join(root, 'codex-home')
    const agent = path.join(root, 'private', 'ada', 'codex-home')
    await fsp.mkdir(shared, { recursive: true })
    await fsp.mkdir(agent, { recursive: true })
    await fsp.writeFile(path.join(shared, 'auth.json'), '{"shared":true}', 'utf8')
    await copyAuthSharedToAgent(shared, agent)
    expect(await fsp.readFile(path.join(agent, 'auth.json'), 'utf8')).toBe('{"shared":true}')
    await fsp.writeFile(path.join(agent, 'auth.json'), '{"agent":"refreshed"}', 'utf8')
    await copyAuthAgentToShared(agent, shared)
    expect(await fsp.readFile(path.join(shared, 'auth.json'), 'utf8')).toBe('{"agent":"refreshed"}')
  })
})

describe('codex ask mapping', () => {
  it('maps fixture and builds answer rpc', () => {
    const fix = loadRequestUserInputFixture()
    const mapped = mapAskQuestions({ ...fix.params, itemId: 'call-1' })
    expect(mapped.partId).toBe('call-1')
    expect(mapped.questions[0]!.question).toContain('Pick a color')
    const rpc = buildAskAnswerRpc({
      requestId: fix.id,
      questionIds: [fix.params.questions[0]!.id],
      answers: { [fix.params.questions[0]!.id]: 'Alpha' },
    })
    const parsed = JSON.parse(rpc)
    expect(parsed.result.answers[fix.params.questions[0]!.id].answers).toEqual(['Alpha'])
  })
})

describe('codex compact helper', () => {
  it('loads prompt and runs fake compact exec', async () => {
    expect(loadCompactPrompt().length).toBeGreaterThan(10)
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-cmp-'))
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough
      stderr: PassThrough
      exitCode: number | null
      kill: () => boolean
    }
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.exitCode = null
    child.kill = () => true
    const r = await runCodexCompact({
      prompt: 'summarize please',
      cwd: home,
      codexHome: home,
      model: 'gpt-5.6-luna',
      spawnFn: ((cmd: string, argv: string[]) => {
        expect(cmd).toBe('codex')
        expect(argv).toContain('--strict-config')
        queueMicrotask(() => {
          child.stdout.write(
            JSON.stringify({
              type: 'item.completed',
              item: { type: 'agent_message', text: 'BRIEF' },
            }) + '\n',
          )
          child.stdout.end()
          child.exitCode = 0
          child.emit('exit', 0)
        })
        return child as never
      }) as unknown as typeof import('node:child_process').spawn,
    })
    expect(r).toEqual({ ok: true, text: 'BRIEF' })
  })
})

describe('codex adapter runCodexTurn', () => {
  it('spawns detached app-server, streams events, copies auth', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-codex-'))
    const shared = path.join(root, 'codex-home')
    const agentHome = path.join(root, 'private', 'ada', 'codex-home')
    const cwd = path.join(root, 'agents', 'ada', 'workspace')
    await fsp.mkdir(shared, { recursive: true })
    await fsp.mkdir(cwd, { recursive: true })
    await fsp.writeFile(path.join(shared, 'auth.json'), '{"v":1}', 'utf8')

    const fix = loadRequestUserInputFixture()
    let spawnArgs: string[] | null = null
    let spawnOpts: { detached?: boolean; stdio?: unknown; env?: NodeJS.ProcessEnv } | null = null
    const events: HarnessEvent[] = []
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
    ee.pid = 4242
    ee.stdin = stdin
    ee.stdout = stdout
    ee.stderr = stderr
    ee.exitCode = null
    ee.kill = () => {
      ee.exitCode = 0
      ee.emit('exit', 0)
      return true
    }

    void (async () => {
      for await (const line of stdinLines()) {
        const msg = JSON.parse(line) as { id?: number; method?: string; result?: unknown }
        const write = (o: object) => stdout.push(Buffer.from(JSON.stringify(o) + '\n'))
        if (msg.method === 'initialize') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} })
        } else if (msg.method === 'thread/start') {
          write({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: 'thread-1' } } })
        } else if (msg.method === 'turn/start') {
          write({
            jsonrpc: '2.0',
            id: msg.id,
            result: { turn: { id: 'turn-1', status: 'inProgress' } },
          })
          write({
            jsonrpc: '2.0',
            method: 'item/tool/requestUserInput',
            id: fix.id,
            params: fix.params,
          })
        } else if ('result' in msg && msg.id === fix.id) {
          write({ method: 'item/agentMessage/delta', params: { itemId: 'm1', delta: 'DONE:Alpha' } })
          write({
            method: 'item/completed',
            params: {
              item: {
                type: 'commandExecution',
                id: 'c1',
                command: 'echo hi',
                status: 'completed',
                aggregatedOutput: 'hi',
              },
            },
          })
          write({
            method: 'thread/tokenUsage/updated',
            params: {
              tokenUsage: { last: { inputTokens: 3, outputTokens: 1 }, modelContextWindow: 100 },
            },
          })
          write({ method: 'turn/completed', params: { turn: { id: 'turn-1', status: 'completed' } } })
          await fsp.writeFile(path.join(agentHome, 'auth.json'), '{"v":2}', 'utf8')
          ee.exitCode = 0
          ee.emit('exit', 0)
          break
        }
      }
    })()

    const handle = runCodexTurn({
      promptText: 'hello',
      cwd,
      model: 'gpt-5.6-luna',
      effort: 'high',
      sessionId: null,
      memoryAppend: 'ask often',
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
      onAsk: async ({ questions }) => ({
        questions,
        answers: { [fix.params.questions[0]!.id]: 'Alpha' },
      }),
      spawnFn: ((cmd: string, args: string[], opts: Record<string, unknown>) => {
        expect(cmd).toBe('codex')
        spawnArgs = args
        spawnOpts = opts as { detached?: boolean; stdio?: unknown; env?: NodeJS.ProcessEnv }
        return ee as never
      }) as unknown as typeof import('node:child_process').spawn,
    })

    const result = await handle.done
    expect(spawnArgs).toEqual([
      'app-server',
      '--listen',
      'stdio://',
      '--strict-config',
      '-c',
      'model_reasoning_effort=high',
    ])
    expect(spawnOpts).toBeTruthy()
    expect(spawnOpts!.detached).toBe(true)
    expect(result.sessionId).toBe('thread-1')
    expect(events.some((e) => e.kind === 'turn-started')).toBe(true)
    expect(events.some((e) => e.kind === 'ask-user-question')).toBe(true)
    expect(events.some((e) => e.kind === 'assistant-text')).toBe(true)
    expect(events.some((e) => e.kind === 'tool-use')).toBe(true)
    expect(events.some((e) => e.kind === 'turn-finished')).toBe(true)
    expect(await fsp.readFile(path.join(shared, 'auth.json'), 'utf8')).toBe('{"v":2}')
  }, 10_000)
})


describe('codex adapter edge paths', () => {
  it('covers resume + cancelled ask + item mappings', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-codex-edge-'))
    const shared = path.join(root, 'codex-home')
    const agentHome = path.join(root, 'private', 'ada', 'codex-home')
    const cwd = path.join(root, 'agents', 'ada', 'workspace')
    await fsp.mkdir(shared, { recursive: true })
    await fsp.mkdir(cwd, { recursive: true })
    await fsp.writeFile(path.join(shared, 'auth.json'), '{"v":1}', 'utf8')
    const fix = loadRequestUserInputFixture()

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
    ee.pid = 4242
    ee.stdin = stdin
    ee.stdout = stdout
    ee.stderr = stderr
    ee.exitCode = null
    ee.kill = () => {
      ee.exitCode = 0
      ee.emit('exit', 0)
      return true
    }

    let sawCancel = false
    void (async () => {
      for await (const line of stdinLines()) {
        const msg = JSON.parse(line) as { id?: number; method?: string; result?: unknown }
        const write = (o: object) => stdout.push(Buffer.from(JSON.stringify(o) + '\n'))
        if (msg.method === 'initialize') {
          write({ jsonrpc: '2.0', id: msg.id, result: {} })
        } else if (msg.method === 'thread/resume') {
          write({ jsonrpc: '2.0', id: msg.id, result: { thread: { id: 'thread-resume' } } })
        } else if (msg.method === 'turn/start') {
          write({
            jsonrpc: '2.0',
            id: msg.id,
            result: { turn: { id: 'turn-1', status: 'inProgress' } },
          })
          write({
            jsonrpc: '2.0',
            method: 'item/tool/requestUserInput',
            id: fix.id,
            params: fix.params,
          })
        } else if ('result' in msg && msg.id === fix.id) {
          sawCancel = true
          write({
            method: 'item/completed',
            params: { item: { type: 'reasoning', id: 'r1', text: 'thinking' } },
          })
          write({
            method: 'item/completed',
            params: {
              item: {
                type: 'mcpToolCall',
                id: 'm1',
                tool: 'shell_run',
                arguments: { cmd: 'ls' },
                status: 'completed',
                result: { ok: true },
              },
            },
          })
          write({
            method: 'item/completed',
            params: { item: { type: 'agentMessage', id: 'a1', text: 'done' } },
          })
          write({
            method: 'turn/completed',
            params: { turn: { id: 'turn-1', status: 'completed' } },
          })
          break
        }
      }
    })()

    const events: HarnessEvent[] = []
    const handle = runCodexTurn({
      promptText: 'resume me',
      cwd,
      model: 'gpt-5.6-luna',
      sessionId: 'thread-old',
      memoryAppend: 'mem',
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
      spawnFn: (() => ee) as unknown as typeof import('node:child_process').spawn,
    })

    const result = await handle.done
    expect(result.sessionId).toBe('thread-resume')
    expect(sawCancel).toBe(true)
    expect(events.some((e) => e.kind === 'ask-user-question')).toBe(true)
    expect(events.some((e) => e.kind === 'reasoning-text')).toBe(true)
    expect(events.some((e) => e.kind === 'tool-use')).toBe(true)
    expect(events.some((e) => e.kind === 'turn-finished')).toBe(true)
  }, 10_000)

  it('buildCodexArgv resume and assertSafe', () => {
    const resume = buildCodexArgv('resume', {
      prompt: 'cont',
      threadId: 'tid',
      model: 'gpt-5.6-luna',
    })
    expect(resume).toContain('resume')
    expect(resume).toContain('tid')
    expect(() => assertSafeCodexArgv(['exec', '--sandbox'])).toThrow(/sandbox/)
    expect(() => assertSafeCodexArgv(['exec', '--effort', 'high'])).toThrow(/effort/)
    expect(() => assertSafeCodexArgv(['exec'])).toThrow(/strict-config/)
  })
})

describe('codex coverage extras', () => {
  it('assertSafeCodexArgv rejects sandbox and effort', () => {
    expect(() => assertSafeCodexArgv(['app-server', '--sandbox'])).toThrow(/sandbox/)
    expect(() => assertSafeCodexArgv(['app-server', '--effort'])).toThrow(/effort/)
    expect(() => assertSafeCodexArgv(['app-server'])).toThrow(/strict-config/)
  })

  it('runCodexCompact returns error on non-zero exit without text', async () => {
    const spawnFn = (() => {
      const ee = new EventEmitter() as EventEmitter & {
        stdout: Readable
        stderr: Readable
        exitCode: number | null
      }
      const stdout = new Readable({ read() {} })
      ee.stdout = stdout
      ee.stderr = new Readable({ read() {} })
      ee.exitCode = null
      queueMicrotask(() => {
        stdout.push(null)
        ee.exitCode = 2
        ee.emit('exit', 2)
      })
      return ee
    }) as never
    const r = await runCodexCompact({
      spawnFn,
      prompt: 'summarize',
      cwd: '/tmp',
      codexHome: '/tmp',
    })
    expect(r).toEqual({ ok: false, error: 'compact-exit-2' })
  })

})


describe('codex edge coverage', () => {
  it('auth copy tolerates missing auth.json (ENOENT)', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-auth-enoent-'))
    const shared = path.join(root, 'shared')
    const agent = path.join(root, 'agent')
    await fsp.mkdir(shared, { recursive: true })
    await copyAuthSharedToAgent(shared, agent)
    await copyAuthAgentToShared(agent, shared)
    await expect(fsp.access(path.join(agent, 'auth.json'))).rejects.toThrow()
  })

  it('auth copy rethrows non-ENOENT', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'openbot-auth-err-'))
    const shared = path.join(root, 'shared')
    const agent = path.join(root, 'agent')
    await fsp.mkdir(shared, { recursive: true })
    // Create a directory named auth.json so copyFile fails with EISDIR
    await fsp.mkdir(path.join(shared, 'auth.json'), { recursive: true })
    await expect(copyAuthSharedToAgent(shared, agent)).rejects.toThrow()
  })

  it('ask mapping throws on empty question; answer rpc uses response fallback', () => {
    expect(() =>
      mapRequestUserInputToAsk({ questions: [{ id: 'q1', question: '' }] }),
    ).toThrow(/run the probe/)
    const line = buildAskAnswerRpc({
      requestId: 9,
      questionIds: ['q1'],
      answers: {},
      response: 'picked',
    })
    expect(JSON.parse(line).result.answers.q1.answers).toEqual(['picked'])
  })

  it('assertNoHomeDirWritableRoots rejects homeDir', () => {
    expect(() =>
      assertNoHomeDirWritableRoots('writable_roots = ["homeDir"]'),
    ).toThrow(/homeDir/)
    expect(() => assertNoHomeDirWritableRoots('writable_roots = []')).not.toThrow()
  })

  it('runCodexCompact handles already-exited child', async () => {
    const spawnFn = (() => {
      const ee = new EventEmitter() as EventEmitter & {
        stdout: Readable
        stderr: Readable
        exitCode: number | null
      }
      const stdout = new Readable({ read() {} })
      ee.stdout = stdout
      ee.stderr = new Readable({ read() {} })
      ee.exitCode = 0
      queueMicrotask(() => {
        stdout.push(
          JSON.stringify({
            type: 'item.completed',
            item: { type: 'agent_message', text: 'SUM' },
          }) + '\n',
        )
        stdout.push(null)
      })
      return ee
    }) as never
    const r = await runCodexCompact({
      spawnFn,
      prompt: 'summarize',
      cwd: '/tmp',
      codexHome: '/tmp',
    })
    expect(r).toEqual({ ok: true, text: 'SUM' })
  })
})
