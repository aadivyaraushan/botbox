import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'

export const AgentCreateRequestSchema = z
  .object({
    type: z.literal('agent.create'),
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()

export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>

export const AgentCreateResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      agent: AgentConfigSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['invalid-name', 'slug-taken', 'need-name-or-description']),
    })
    .strict(),
])

export type AgentCreateResponse = z.infer<typeof AgentCreateResponseSchema>
