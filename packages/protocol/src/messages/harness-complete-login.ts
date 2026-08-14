import { z } from 'zod'
import { HarnessIdSchema } from '../domain/agent'

export const HarnessCompleteLoginRequestSchema = z
  .object({
    type: z.literal('harness.completeLogin'),
    agentId: z.string(),
    harness: HarnessIdSchema,
    code: z.string().min(1),
  })
  .strict()

export type HarnessCompleteLoginRequest = z.infer<typeof HarnessCompleteLoginRequestSchema>

export const HarnessCompleteLoginResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['no-login-in-flight', 'agent-not-found']),
    })
    .strict(),
])

export type HarnessCompleteLoginResponse = z.infer<typeof HarnessCompleteLoginResponseSchema>
