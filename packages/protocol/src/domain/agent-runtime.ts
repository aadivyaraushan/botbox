import { z } from 'zod'

export const AgentStateSchema = z.enum([
  'idle',
  'thinking',
  'needs-you',
  'memorizing',
  'compacting',
  'paused',
  'error',
])

export type AgentState = z.infer<typeof AgentStateSchema>

export const HarnessAuthSchema = z
  .object({
    'claude-code': z.enum(['logged-in', 'logged-out']),
    codex: z.enum(['logged-in', 'logged-out']),
  })
  .strict()

export type HarnessAuth = z.infer<typeof HarnessAuthSchema>

export const AgentRuntimeSchema = z
  .object({
    agentId: z.string(),
    state: AgentStateSchema,
    queueCount: z.number(),
    spendUsdToday: z.number(),
    harnessAuth: HarnessAuthSchema,
    humanControl: z
      .object({
        held: z.boolean(),
      })
      .strict(),
    talkingToAgentId: z.string().nullable(),
    contextUsed: z.number().nullable(),
    contextWindow: z.number().nullable(),
    sessionId: z.string().nullable(),
    mcp: z.array(
      z
        .object({
          name: z.enum(['openbot', 'hindsight']),
          url: z.string(),
          last: z.enum(['ok', 'fail']).nullable(),
        })
        .strict(),
    ),
  })
  .strict()

export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>
