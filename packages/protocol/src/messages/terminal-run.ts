import { z } from 'zod'

export const TerminalRunRequestSchema = z
  .object({
    type: z.literal('terminal.run'),
    agentId: z.string(),
    command: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().optional(),
    tabId: z.string().optional(),
    stealFocus: z.literal(false),
  })
  .strict()

export type TerminalRunRequest = z.infer<typeof TerminalRunRequestSchema>

export const TerminalRunResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      tabId: z.string(),
      exitCode: z.number(),
      output: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum([
        'no-app',
        'unknown-agent',
        'write-denied',
        'timeout',
        'interrupted',
        'op-failed',
      ]),
    })
    .strict(),
])

export type TerminalRunResponse = z.infer<typeof TerminalRunResponseSchema>
