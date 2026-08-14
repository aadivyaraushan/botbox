import { z } from 'zod'
import { HarnessIdSchema } from '../domain/agent'

export const HarnessStartLoginRequestSchema = z
  .object({
    type: z.literal('harness.startLogin'),
    agentId: z.string(),
    harness: HarnessIdSchema,
  })
  .strict()

export type HarnessStartLoginRequest = z.infer<typeof HarnessStartLoginRequestSchema>

export const HarnessStartLoginResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['busy', 'already-logged-in', 'agent-not-found', 'bad-state']),
    })
    .strict(),
])

export type HarnessStartLoginResponse = z.infer<typeof HarnessStartLoginResponseSchema>
