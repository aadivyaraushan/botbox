import { z } from 'zod'

export const AgentPauseRequestSchema = z
  .object({
    type: z.literal('agent.pause'),
    agentId: z.string(),
  })
  .strict()

export type AgentPauseRequest = z.infer<typeof AgentPauseRequestSchema>

export const AgentPauseResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type AgentPauseResponse = z.infer<typeof AgentPauseResponseSchema>
