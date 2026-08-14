import { z } from 'zod'

export const TerminalReadRequestSchema = z
  .object({
    type: z.literal('terminal.read'),
    agentId: z.string(),
  })
  .strict()

export type TerminalReadRequest = z.infer<typeof TerminalReadRequestSchema>

export const TerminalReadResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['no-terminal', 'unknown-agent']),
    })
    .strict(),
])

export type TerminalReadResponse = z.infer<typeof TerminalReadResponseSchema>
