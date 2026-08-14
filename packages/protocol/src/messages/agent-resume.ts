import { z } from 'zod'

export const AgentResumeRequestSchema = z
  .object({
    type: z.literal('agent.resume'),
    agentId: z.string(),
  })
  .strict()

export type AgentResumeRequest = z.infer<typeof AgentResumeRequestSchema>

export const AgentResumeResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'bad-state']),
    })
    .strict(),
])

export type AgentResumeResponse = z.infer<typeof AgentResumeResponseSchema>
