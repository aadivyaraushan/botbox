import { z } from 'zod'

export const EventStreamRequestSchema = z
  .object({
    type: z.literal('event.stream'),
    after: z.number().optional(),
  })
  .strict()

export type EventStreamRequest = z.infer<typeof EventStreamRequestSchema>

export const EventStreamMetaSchema = z
  .object({
    type: z.literal('event.stream.meta'),
    replayReset: z.literal(true),
  })
  .strict()

export type EventStreamMeta = z.infer<typeof EventStreamMetaSchema>
