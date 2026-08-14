import { z } from 'zod'
import { AgentConfigSchema } from '../domain/agent'
import { AgentRuntimeSchema } from '../domain/agent-runtime'
import { BannerSchema } from '../domain/daemon-event'

export const AgentListRequestSchema = z
  .object({
    type: z.literal('agent.list'),
  })
  .strict()

export type AgentListRequest = z.infer<typeof AgentListRequestSchema>

const AgentListItemSchema = z
  .object({
    agent: AgentConfigSchema,
    runtime: AgentRuntimeSchema,
    banners: z.array(BannerSchema),
  })
  .strict()

export const AgentListResponseSchema = z
  .object({
    ok: z.literal(true),
    agents: z.array(AgentListItemSchema),
  })
  .strict()

export type AgentListResponse = z.infer<typeof AgentListResponseSchema>
