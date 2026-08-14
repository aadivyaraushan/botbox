import { z } from 'zod'

export const AgentFilesRequestSchema = z
  .object({
    type: z.literal('agent.files'),
    agentId: z.string(),
  })
  .strict()

export type AgentFilesRequest = z.infer<typeof AgentFilesRequestSchema>

export const AgentFilesResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      files: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type AgentFilesResponse = z.infer<typeof AgentFilesResponseSchema>
