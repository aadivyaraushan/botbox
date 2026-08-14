import { z } from 'zod'

export const AgentCompactRequestSchema = z
  .object({
    type: z.literal('agent.compact'),
    agentId: z.string(),
  })
  .strict()

export type AgentCompactRequest = z.infer<typeof AgentCompactRequestSchema>

export const AgentCompactResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'agent-not-found', 'needs-login']),
    })
    .strict(),
])

export type AgentCompactResponse = z.infer<typeof AgentCompactResponseSchema>
