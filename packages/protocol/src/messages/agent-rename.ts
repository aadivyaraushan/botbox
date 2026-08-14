import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'

export const AgentRenameRequestSchema = z
  .object({
    type: z.literal('agent.rename'),
    agentId: z.string(),
    name: z.string(),
  })
  .strict()

export type AgentRenameRequest = z.infer<typeof AgentRenameRequestSchema>

export const AgentRenameResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      agent: AgentConfigSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'invalid-name']),
    })
    .strict(),
])

export type AgentRenameResponse = z.infer<typeof AgentRenameResponseSchema>
