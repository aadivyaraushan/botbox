import { z } from 'zod'

export const AgentDeleteRequestSchema = z
  .object({
    type: z.literal('agent.delete'),
    agentId: z.string(),
  })
  .strict()

export type AgentDeleteRequest = z.infer<typeof AgentDeleteRequestSchema>

export const AgentDeleteResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'memory-delete-failed']),
    })
    .strict(),
])

export type AgentDeleteResponse = z.infer<typeof AgentDeleteResponseSchema>
