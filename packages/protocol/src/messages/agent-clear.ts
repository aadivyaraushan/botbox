import { z } from 'zod'

export const AgentClearRequestSchema = z
  .object({
    type: z.literal('agent.clear'),
    agentId: z.string(),
  })
  .strict()

export type AgentClearRequest = z.infer<typeof AgentClearRequestSchema>

export const AgentClearResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'agent-not-found']),
    })
    .strict(),
])

export type AgentClearResponse = z.infer<typeof AgentClearResponseSchema>
