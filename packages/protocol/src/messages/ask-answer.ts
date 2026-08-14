import { z } from 'zod'

export const AskAnswerRequestSchema = z
  .object({
    type: z.literal('ask.answer'),
    agentId: z.string(),
    partId: z.string(),
    answers: z.record(z.string(), z.string()),
    response: z.string().optional(),
  })
  .strict()

export type AskAnswerRequest = z.infer<typeof AskAnswerRequestSchema>

export const AskAnswerResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['not-open', 'agent-not-found']),
    })
    .strict(),
])

export type AskAnswerResponse = z.infer<typeof AskAnswerResponseSchema>
