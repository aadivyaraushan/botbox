import { z } from 'zod'

export const AgentSkillsRequestSchema = z
  .object({
    type: z.literal('agent.skills'),
    agentId: z.string(),
  })
  .strict()

export type AgentSkillsRequest = z.infer<typeof AgentSkillsRequestSchema>

export const AgentSkillsResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      skills: z.array(
        z
          .object({
            name: z.string(),
            body: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type AgentSkillsResponse = z.infer<typeof AgentSkillsResponseSchema>
