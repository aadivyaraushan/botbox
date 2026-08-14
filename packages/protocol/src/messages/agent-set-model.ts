import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'

export const AgentSetModelRequestSchema = z
  .object({
    type: z.literal('agent.setModel'),
    agentId: z.string(),
    model: z.string(),
    effort: z.string().optional(),
  })
  .strict()

export type AgentSetModelRequest = z.infer<typeof AgentSetModelRequestSchema>

export const AgentSetModelResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      agent: AgentConfigSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'invalid-model', 'agent-not-found']),
    })
    .strict(),
])

export type AgentSetModelResponse = z.infer<typeof AgentSetModelResponseSchema>
