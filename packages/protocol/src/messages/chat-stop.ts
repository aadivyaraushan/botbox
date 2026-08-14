import { z } from 'zod'

export const ChatStopRequestSchema = z
  .object({
    type: z.literal('chat.stop'),
    agentId: z.string(),
  })
  .strict()

export type ChatStopRequest = z.infer<typeof ChatStopRequestSchema>

export const ChatStopResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      stopped: z.boolean(),
      turnId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type ChatStopResponse = z.infer<typeof ChatStopResponseSchema>
