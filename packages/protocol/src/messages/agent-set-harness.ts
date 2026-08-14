import { z } from 'zod'
import { HarnessIdSchema } from '../domain/agent'

export const AgentSetHarnessRequestSchema = z
  .object({
    type: z.literal('agent.setHarness'),
    agentId: z.string(),
    harness: HarnessIdSchema,
  })
  .strict()

export type AgentSetHarnessRequest = z.infer<typeof AgentSetHarnessRequestSchema>

export const AgentSetHarnessResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      harness: HarnessIdSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'compact-failed', 'inject-failed', 'needs-login', 'agent-not-found']),
    })
    .strict(),
])

export type AgentSetHarnessResponse = z.infer<typeof AgentSetHarnessResponseSchema>
