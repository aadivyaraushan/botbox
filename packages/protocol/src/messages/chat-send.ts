import { z } from 'zod'

export const ChatSendRequestSchema = z
  .object({
    type: z.literal('chat.send'),
    agentId: z.string(),
    text: z.string(),
  })
  .strict()

export type ChatSendRequest = z.infer<typeof ChatSendRequestSchema>

export const ChatSendResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      turnId: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'paused', 'needs-login', 'text-empty']),
    })
    .strict(),
])

export type ChatSendResponse = z.infer<typeof ChatSendResponseSchema>
