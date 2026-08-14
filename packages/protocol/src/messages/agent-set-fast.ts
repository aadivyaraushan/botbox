import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'

export const AgentSetFastRequestSchema = z
  .object({
    type: z.literal('agent.setFast'),
    agentId: z.string(),
    fast: z.boolean(),
  })
  .strict()

export type AgentSetFastRequest = z.infer<typeof AgentSetFastRequestSchema>

export const AgentSetFastResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      agent: AgentConfigSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'agent-not-found']),
    })
    .strict(),
])

export type AgentSetFastResponse = z.infer<typeof AgentSetFastResponseSchema>
