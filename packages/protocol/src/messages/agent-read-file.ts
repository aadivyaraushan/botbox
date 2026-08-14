import { z } from 'zod'

export const AgentReadFileRequestSchema = z
  .object({
    type: z.literal('agent.readFile'),
    agentId: z.string(),
    path: z.string(),
  })
  .strict()

export type AgentReadFileRequest = z.infer<typeof AgentReadFileRequestSchema>

export const AgentReadFileResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'not-found', 'forbidden']),
    })
    .strict(),
])

export type AgentReadFileResponse = z.infer<typeof AgentReadFileResponseSchema>
