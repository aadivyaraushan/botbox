import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'
import { AgentRuntimeSchema } from '../domain/agent-runtime'
import { BannerSchema } from '../domain/daemon-event'

export const AgentGetRequestSchema = z
  .object({
    type: z.literal('agent.get'),
    agentId: z.string(),
  })
  .strict()

export type AgentGetRequest = z.infer<typeof AgentGetRequestSchema>

export const AgentGetResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      agent: AgentConfigSchema,
      runtime: AgentRuntimeSchema,
      banners: z.array(BannerSchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type AgentGetResponse = z.infer<typeof AgentGetResponseSchema>
