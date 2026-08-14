import { query as defaultQuery } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent } from '@openbot/protocol'
import { writeDeny } from './write-deny.js'

export type QueryFn = typeof defaultQuery

export type RunTurnOptions = {
  queryFn?: QueryFn
  promptText: string
  cwd: string
  model: string
  effort?: string
  sessionId?: string | null
  memoryAppend: string
  mcpServers: Record<string, { type: 'http'; url: string; timeout?: number }>
  writeDenyCtx: Parameters<typeof writeDeny>[2]
  onEvent: (ev: HarnessEvent) => void | Promise<void>
  onAsk: (input: {
    partId: string
    questions: Array<{
      question: string
      header: string
      options: Array<{ label: string; description: string }>
      multiSelect: boolean
    }>
  }) => Promise<{ questions: unknown; answers: Record<string, string>; response?: string } | 'cancelled'>
  abortSignal?: AbortSignal
  thinking?: { type: 'adaptive' }
  /** OPENBOT claude-config dir — passed as CLAUDE_CONFIG_DIR (SDK env replaces process.env). */
  claudeConfigDir?: string
}

export type RunTurnHandle = {
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
  }>
}

function inputSummary(input: Record<string, unknown>): string {
  const v =
    (input.file_path as string) ||
    (input.command as string) ||
    (input.pattern as string) ||
    JSON.stringify(input)
  return String(v).slice(0, 200)
}

/** Preferred visible-shell wiring. When toolAliases missing from SDK types, keep Bash. */
export function buildClaudeShellOptions(opts: {
  toolAliasesAvailable: boolean
}): { toolAliases?: Record<string, string>; disallowedTools?: string[] } {
  if (!opts.toolAliasesAvailable) {
    return {}
  }
  return { toolAliases: { Bash: 'mcp__openbot__shell_run' } }
}

export function sdkHasToolAliases(): boolean {
  return true
}

export function runTurn(opts: RunTurnOptions): RunTurnHandle {
  const queryFn = opts.queryFn ?? defaultQuery
  let messageIndex = 0
  let interrupted = false
  let q: ReturnType<QueryFn> | null = null
  const toolNames = new Map<string, string>()

  async function* userTurns() {
    yield {
      type: 'user' as const,
      message: { role: 'user' as const, content: opts.promptText },
      parent_tool_use_id: null,
    }
  }

  const prompt = userTurns()

  const done = (async () => {
    let sessionId = opts.sessionId ?? 'pending'
    let outcome: 'complete' | 'interrupted' | 'error' = 'complete'
    let errorMessage: string | undefined
    let usage: {
      costUsd: number | null
      inputTokens?: number
      outputTokens?: number
      contextWindow?: number
    } = { costUsd: null }

    const queryOptions: Record<string, unknown> = {
      cwd: opts.cwd,
      model: opts.model,
      includePartialMessages: true,
      permissionMode: 'default',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: opts.memoryAppend,
      },
      mcpServers: opts.mcpServers,
      hooks: {
        PreToolUse: [
          {
            hooks: [
              async (input: { tool_name?: string; tool_input?: Record<string, unknown> }) => {
                return writeDeny(
                  input.tool_name ?? '',
                  (input.tool_input ?? {}) as Record<string, unknown>,
                  opts.writeDenyCtx,
                )
              },
            ],
          },
        ],
      },
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (toolName === 'AskUserQuestion') {
          const questionsRaw = (input.questions as Array<Record<string, unknown>>) ?? []
          const questions = questionsRaw.map((q) => ({
            question: String(q.question ?? ''),
            header: String(q.header ?? String(q.question ?? '').slice(0, 12)),
            options: ((q.options as Array<Record<string, unknown>>) ?? []).map((o) => ({
              label: String(o.label ?? ''),
              description: String(o.description ?? ''),
            })),
            multiSelect: Boolean(q.multiSelect),
          }))
          const partId = `ask-${Date.now()}`
          const ans = await opts.onAsk({ partId, questions })
          if (ans === 'cancelled') {
            return { behavior: 'deny', message: 'User stopped' }
          }
          return {
            behavior: 'allow',
            updatedInput: {
              questions: ans.questions,
              answers: ans.answers,
              ...(ans.response !== undefined ? { response: ans.response } : {}),
            },
          }
        }
        return { behavior: 'allow', updatedInput: input }
      },
    }
    if (opts.effort) queryOptions.effort = opts.effort
    if (opts.sessionId) queryOptions.resume = opts.sessionId
    if (opts.thinking) queryOptions.thinking = opts.thinking
    if (opts.claudeConfigDir) {
      queryOptions.env = {
        ...process.env,
        CLAUDE_CONFIG_DIR: opts.claudeConfigDir,
        MCP_TIMEOUT: '3600000',
        MCP_TOOL_TIMEOUT: '3600000',
        CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: '0',
      }
    }
    const shellOpts = buildClaudeShellOptions({ toolAliasesAvailable: sdkHasToolAliases() })
    if (shellOpts.toolAliases) queryOptions.toolAliases = shellOpts.toolAliases

    q = queryFn({ prompt, options: queryOptions as never })

    const firstMessageTimer = setTimeout(() => {
      if (sessionId === 'pending') {
        interrupted = true
        void q?.interrupt?.()
      }
    }, 60_000)

    try {
      for await (const message of q) {
        if (interrupted) break
        const m = message as Record<string, unknown>
        if (m.type === 'system' && m.subtype === 'init') {
          sessionId = String(m.session_id ?? sessionId)
          await opts.onEvent({ kind: 'turn-started', sessionId })
        } else if (m.type === 'stream_event') {
          const event = m.event as Record<string, unknown>
          if (event.type === 'message_start') {
            messageIndex += 1
            if (sessionId === 'pending' && m.session_id) sessionId = String(m.session_id)
          } else if (event.type === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown>
            const index = Number(event.index ?? 0)
            const partId = `m${messageIndex}c${index}`
            if (delta.type === 'thinking_delta' || delta.type === 'reasoning_delta') {
              await opts.onEvent({
                kind: 'reasoning-text',
                partId,
                delta: String(delta.thinking ?? delta.text ?? delta.reasoning ?? ''),
              })
            } else if (delta.type === 'text_delta') {
              await opts.onEvent({
                kind: 'assistant-text',
                partId,
                delta: String(delta.text ?? ''),
              })
            }
          } else if (event.type === 'content_block_start') {
            const block = event.content_block as Record<string, unknown>
            if (block?.type === 'thinking' || block?.type === 'reasoning') {
              // start — deltas follow
            }
          }
        } else if (m.type === 'assistant') {
          const msg = m.message as { content?: Array<Record<string, unknown>> }
          // If message_start was missed, bump index
          if (!m._counted) messageIndex += 0
          const content = msg?.content ?? []
          for (let i = 0; i < content.length; i++) {
            const block = content[i]!
            if (block.type === 'tool_use') {
              const id = String(block.id)
              const name = String(block.name)
              toolNames.set(id, name)
              await opts.onEvent({
                kind: 'tool-use',
                callId: id,
                name,
                inputSummary: inputSummary((block.input ?? {}) as Record<string, unknown>),
              })
            }
            // ignore text/thinking on complete assistant (deltas already applied)
          }
          if (sessionId === 'pending' && m.session_id) sessionId = String(m.session_id)
        } else if (m.type === 'user') {
          const msg = m.message as { content?: Array<Record<string, unknown>> }
          for (const block of msg?.content ?? []) {
            if (block.type === 'tool_result') {
              const id = String(block.tool_use_id ?? block.id ?? '')
              const name = toolNames.get(id) ?? 'tool'
              const text =
                typeof block.content === 'string'
                  ? block.content
                  : JSON.stringify(block.content ?? '')
              await opts.onEvent({
                kind: 'tool-result',
                callId: id,
                name,
                ok: !block.is_error,
                outputSummary: text.slice(0, 500),
              })
            }
          }
        } else if (m.type === 'result') {
          sessionId = String(m.session_id ?? sessionId)
          const cost = m.total_cost_usd
          usage = {
            costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
            ...(typeof m.usage === 'object' && m.usage
              ? {
                  inputTokens: (m.usage as { input_tokens?: number }).input_tokens,
                  outputTokens: (m.usage as { output_tokens?: number }).output_tokens,
                }
              : {}),
          }
          if (m.subtype === 'success') {
            outcome = 'complete'
          } else {
            outcome = 'error'
            errorMessage = String(m.message ?? m.errors ?? 'cli-fatal')
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
            outcome,
            ...(errorMessage ? { errorMessage } : {}),
            usage,
          })
        }
      }
    } catch (e) {
      if (!interrupted) {
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
      }
    } finally {
      clearTimeout(firstMessageTimer)
    }

    if (interrupted && outcome === 'complete') {
      outcome = 'interrupted'
      await opts.onEvent({
        kind: 'turn-finished',
        sessionId,
        outcome: 'interrupted',
        usage,
      })
    }

    return { sessionId, outcome, errorMessage, usage }
  })()

  return {
    interrupt: async () => {
      interrupted = true
      await q?.interrupt?.()
    },
    done,
  }
}
