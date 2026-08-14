import { z } from 'zod'

export const AgentModelsRequestSchema = z
  .object({
    type: z.literal('agent.models'),
    agentId: z.string(),
  })
  .strict()

export type AgentModelsRequest = z.infer<typeof AgentModelsRequestSchema>

const ModelEntrySchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    efforts: z.array(z.string()).optional(),
  })
  .strict()

export const AgentModelsResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      models: z.array(ModelEntrySchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type AgentModelsResponse = z.infer<typeof AgentModelsResponseSchema>
