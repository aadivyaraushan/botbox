import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { HarnessEvent } from '@openbot/protocol'
import { copyAgentAuthToShared, copySharedAuthToAgent } from './auth.js'
import { mapRequestUserInputToAsk, buildAskAnswerRpc } from './ask.js'
import { assertSafeCodexArgv, buildAppServerArgv } from './exec-argv.js'
import { assertNoHomeDirWritableRoots, buildCodexConfigToml } from './config.js'

export function codexItemToolName(item: Record<string, unknown>): string {
  const type = String(item.type ?? '')
  if (type === 'commandExecution' || type === 'command_execution') return 'Bash'
  if (type === 'mcpToolCall' || type === 'mcp_tool_call') {
    return String(item.tool ?? item.name ?? 'mcp')
  }
  return String(item.tool ?? item.name ?? (type || 'tool'))
}

export type CodexRunTurnOptions = {
  spawnFn?: typeof defaultSpawn
  promptText: string
  cwd: string
  model: string
  effort?: string
  sessionId?: string | null
  memoryAppend: string
  agentCodexHome: string
  sharedCodexHome: string
  config: Parameters<typeof buildCodexConfigToml>[0]
  onEvent: (ev: HarnessEvent) => void | Promise<void>
  onAsk: (input: {
    partId: string
    questions: Array<{
      question: string
      header: string
      options: Array<{ label: string; description: string }>
      multiSelect: boolean
    }>
    questionIds?: string[]
  }) => Promise<{ questions: unknown; answers: Record<string, string>; response?: string } | 'cancelled'>
}

export type CodexRunTurnHandle = {
  interrupt: () => Promise<void>
  done: Promise<{
    sessionId: string
    outcome: 'complete' | 'interrupted' | 'error'
    errorMessage?: string
    usage: {
      costUsd: number | null
      inputTokens?: number
      outputTokens?: number
      contextWindow?: number
    }
    spawn: { argv: string[]; detached: boolean; stdio: unknown }
  }>
}

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

export function runCodexTurn(opts: CodexRunTurnOptions): CodexRunTurnHandle {
  const spawnFn = opts.spawnFn ?? defaultSpawn
  let child: ChildProcess | null = null
  let interrupted = false
  let sessionId = opts.sessionId ?? 'pending'
  let rejectPending: ((reason: string) => void) | null = null
  const usage: {
    costUsd: number | null
    inputTokens?: number
    outputTokens?: number
    contextWindow?: number
  } = { costUsd: null }

  const argv = buildAppServerArgv({ effort: opts.effort })
  assertSafeCodexArgv(argv)

  const done = (async () => {
    await fs.mkdir(opts.agentCodexHome, { recursive: true })
    await copySharedAuthToAgent({
      sharedCodexHome: opts.sharedCodexHome,
      agentCodexHome: opts.agentCodexHome,
    })
    const toml = buildCodexConfigToml(opts.config)
    assertNoHomeDirWritableRoots(toml)
    await fs.writeFile(path.join(opts.agentCodexHome, 'config.toml'), toml, 'utf8')
    await fs.writeFile(path.join(opts.agentCodexHome, 'AGENTS.md'), opts.memoryAppend, 'utf8')

    child = spawnFn('codex', argv, {
      cwd: opts.cwd,
      env: { ...process.env, CODEX_HOME: opts.agentCodexHome },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    })

    const spawnMeta = { argv: ['codex', ...argv], detached: true, stdio: ['pipe', 'pipe', 'pipe'] }
    let nextId = 1
    const pending = new Map<number, Pending>()
    const rejectAllPending = (reason: string) => {
      for (const [, p] of pending) p.reject(new Error(reason))
      pending.clear()
    }
    rejectPending = rejectAllPending
    let outcome: 'complete' | 'interrupted' | 'error' = 'complete'
    let errorMessage: string | undefined
    let turnFinished = false

    const send = (method: string, params: unknown): Promise<unknown> => {
      if (interrupted) return Promise.reject(new Error('interrupted'))
      const id = nextId++
      const line = JSON.stringify({ jsonrpc: '2.0', id, method, params })
      child!.stdin!.write(line + '\n')
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
      })
    }

    const respond = (id: number | string, result: unknown) => {
      child!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
    }

    const rl = readline.createInterface({ input: child.stdout! })
    const onLine = async (line: string) => {
      if (!line.trim()) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        return
      }

      if (typeof msg.id === 'number' && pending.has(msg.id) && ('result' in msg || 'error' in msg)) {
        const p = pending.get(msg.id)!
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
        else p.resolve(msg.result)
        return
      }

      const method = typeof msg.method === 'string' ? msg.method : ''
      if (method === 'item/tool/requestUserInput' && msg.id != null) {
        const params = msg.params as {
          questions: Array<{
            id: string
            header?: string
            question: string
            options?: Array<{ label: string; description?: string }>
          }>
        }
        const questions = mapRequestUserInputToAsk(params)
        const partId = String(
          (msg.params as { itemId?: string })?.itemId ?? `ask-${Date.now()}`,
        )
        await opts.onEvent({
          kind: 'ask-user-question',
          partId,
          questions,
          status: 'open',
        })
        const ans = await opts.onAsk({
          partId,
          questions,
          questionIds: params.questions.map((q) => q.id),
        })
        if (ans === 'cancelled') {
          respond(msg.id as number | string, {
            answers: Object.fromEntries(
              params.questions.map((q) => [q.id, { answers: ['cancelled'] }]),
            ),
          })
          return
        }
        const rpc = buildAskAnswerRpc({
          requestId: msg.id as number | string,
          questionIds: params.questions.map((q) => q.id),
          answers: ans.answers,
          response: ans.response,
        })
        child!.stdin!.write(rpc + '\n')
        return
      }

      if (method === 'item/agentMessage/delta') {
        const params = msg.params as { itemId?: string; delta?: string }
        await opts.onEvent({
          kind: 'assistant-text',
          partId: String(params.itemId ?? 'msg'),
          delta: String(params.delta ?? ''),
        })
        return
      }

      if (method === 'item/completed') {
        const item = (msg.params as { item?: Record<string, unknown> })?.item
        if (!item) return
        const type = String(item.type ?? '')
        if (type === 'reasoning') {
          const text =
            typeof item.text === 'string'
              ? item.text
              : Array.isArray(item.summary)
                ? (item.summary as unknown[]).map(String).join('\n')
                : ''
          if (text) {
            await opts.onEvent({
              kind: 'reasoning-text',
              partId: String(item.id ?? 'reasoning'),
              delta: text,
            })
          }
        } else if (type === 'commandExecution' || type === 'command_execution') {
          const callId = String(item.id ?? 'cmd')
          const name = codexItemToolName(item)
          await opts.onEvent({
            kind: 'tool-use',
            callId,
            name,
            inputSummary: String(item.command ?? '').slice(0, 200),
          })
          await opts.onEvent({
            kind: 'tool-result',
            callId,
            name,
            ok: item.status !== 'failed',
            outputSummary: String(item.aggregated_output ?? item.aggregatedOutput ?? '').slice(
              0,
              500,
            ),
          })
        } else if (type === 'mcpToolCall' || type === 'mcp_tool_call') {
          const callId = String(item.id ?? 'mcp')
          const name = codexItemToolName(item)
          await opts.onEvent({
            kind: 'tool-use',
            callId,
            name,
            inputSummary: JSON.stringify(item.arguments ?? {}).slice(0, 200),
          })
          await opts.onEvent({
            kind: 'tool-result',
            callId,
            name,
            ok: item.status !== 'failed',
            outputSummary: JSON.stringify(item.result ?? item.error ?? '').slice(0, 500),
          })
        } else if (type === 'agentMessage' || type === 'agent_message') {
          const text = String(item.text ?? '')
          if (text) {
            await opts.onEvent({
              kind: 'assistant-text',
              partId: String(item.id ?? 'msg'),
              delta: text,
            })
          }
        } else if (type === 'error') {
          const message = String(item.message ?? '')
          if (/hook trust/i.test(message)) return
          await opts.onEvent({
            kind: 'error',
            message,
            fatal: false,
            code: 'cli-fatal',
          })
        }
        return
      }

      if (method === 'thread/tokenUsage/updated') {
        const tu = (msg.params as { tokenUsage?: { last?: Record<string, number>; modelContextWindow?: number } })
          ?.tokenUsage
        const last = tu?.last
        if (last) {
          usage.inputTokens = last.inputTokens
          usage.outputTokens = last.outputTokens
          if (tu.modelContextWindow) usage.contextWindow = tu.modelContextWindow
        }
        return
      }

      if (method === 'turn/completed') {
        if (turnFinished) return
        turnFinished = true
        const turn = (msg.params as { turn?: { status?: string; error?: { message?: string } } })?.turn
        if (turn?.status === 'failed' || turn?.error) {
          outcome = 'error'
          errorMessage = turn.error?.message ?? 'cli-fatal'
          await opts.onEvent({
            kind: 'error',
            message: errorMessage,
            fatal: true,
            code: 'cli-fatal',
          })
        }
        await opts.onEvent({
          kind: 'turn-finished',
          sessionId,
          outcome: interrupted ? 'interrupted' : outcome,
          ...(errorMessage ? { errorMessage } : {}),
          usage,
        })
      }
    }

    let lineChain: Promise<void> = Promise.resolve()
    rl.on('line', (line) => {
      lineChain = lineChain.then(() => onLine(line)).catch((e) => {
        console.error('[codex] line-handler', e)
      })
    })

    child.stderr?.on('data', (buf) => {
      const s = String(buf)
      if (/fatal|cli-fatal/i.test(s)) console.error('[codex]', s.slice(0, 500))
    })

    try {
      await send('initialize', {
        clientInfo: { name: 'openbot', version: '0' },
        capabilities: {},
      })

      if (opts.sessionId) {
        const resumed = (await send('thread/resume', {
          threadId: opts.sessionId,
          model: opts.model,
        })) as { thread?: { id?: string } }
        sessionId = resumed.thread?.id ?? opts.sessionId
      } else {
        const config: Record<string, unknown> = {
          'features.default_mode_request_user_input': true,
        }
        if (opts.effort) config.model_reasoning_effort = opts.effort
        const started = (await send('thread/start', {
          model: opts.model,
          cwd: opts.cwd,
          config,
        })) as { thread?: { id?: string } }
        sessionId = started.thread?.id ?? sessionId
      }

      await opts.onEvent({ kind: 'turn-started', sessionId })

      await send('turn/start', {
        threadId: sessionId,
        input: [{ type: 'text', text: opts.promptText }],
        model: opts.model,
      })

      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (turnFinished || interrupted || (child && child.exitCode !== null)) {
            clearInterval(check)
            resolve()
          }
        }, 50)
        child!.on('exit', () => {
          rejectAllPending('codex-exit')
          clearInterval(check)
          resolve()
        })
      })

      if (!turnFinished) {
        if (interrupted) {
          outcome = 'interrupted'
          await opts.onEvent({
            kind: 'turn-finished',
            sessionId,
            outcome: 'interrupted',
            usage,
          })
        } else {
          outcome = 'error'
          errorMessage = 'cli-fatal'
          await opts.onEvent({
            kind: 'error',
            message: errorMessage,
            fatal: true,
            code: 'cli-fatal',
          })
          await opts.onEvent({
            kind: 'turn-finished',
            sessionId,
            outcome: 'error',
            errorMessage,
            usage,
          })
        }
      }
    } catch (e) {
      outcome = 'error'
      errorMessage = String(e)
      await opts.onEvent({
        kind: 'error',
        message: errorMessage,
        fatal: true,
        code: 'cli-fatal',
      })
      await opts.onEvent({
        kind: 'turn-finished',
        sessionId,
        outcome: 'error',
        errorMessage,
        usage,
      })
    } finally {
      await lineChain
      await copyAgentAuthToShared({
        sharedCodexHome: opts.sharedCodexHome,
        agentCodexHome: opts.agentCodexHome,
      })
      try {
        child?.kill('SIGTERM')
      } catch {
        /* */
      }
    }

    return {
      sessionId,
      outcome: interrupted && outcome === 'complete' ? 'interrupted' : outcome,
      errorMessage,
      usage,
      spawn: spawnMeta,
    }
  })()

  return {
    interrupt: async () => {
      interrupted = true
      rejectPending?.('interrupted')
      if (child?.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          try {
            child.kill('SIGTERM')
          } catch {
            /* */
          }
        }
        setTimeout(() => {
          if (child?.pid) {
            try {
              process.kill(-child.pid, 'SIGKILL')
            } catch {
              /* */
            }
          }
        }, 5000)
      }
    },
    done,
  }
}


export function mapExecUsage(usage: Record<string, unknown>): {
  costUsd: null
  inputTokens?: number
  outputTokens?: number
} {
  return {
    costUsd: null,
    inputTokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined,
  }
}

export function mapAskQuestions(params: Record<string, unknown>) {
  const questions = mapRequestUserInputToAsk(
    params as {
      questions: Array<{
        id: string
        header?: string
        question: string
        options?: Array<{ label: string; description?: string }>
      }>
    },
  )
  return {
    partId: String(params.itemId ?? `ask-${Date.now()}`),
    questions,
    questionIds: ((params.questions as Array<{ id: string }>) ?? []).map((q) => q.id),
  }
}

export { buildCodexArgv } from './exec-argv.js'
