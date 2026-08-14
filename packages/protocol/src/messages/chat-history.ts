import { z } from 'zod'
import { TurnSchema } from '../domain/turn'

export const ChatHistoryRequestSchema = z
  .object({
    type: z.literal('chat.history'),
    agentId: z.string(),
    sinceSeq: z.number().optional(),
    limit: z.number().optional(),
  })
  .strict()

export type ChatHistoryRequest = z.infer<typeof ChatHistoryRequestSchema>

export const ChatHistoryResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      turns: z.array(TurnSchema),
      lastEnvelopeId: z.number(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type ChatHistoryResponse = z.infer<typeof ChatHistoryResponseSchema>
