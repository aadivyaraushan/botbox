import { z } from 'zod'
import { DaemonEventSchema } from './daemon-event'
import { HarnessEventSchema } from './harness-event'

export const StreamEnvelopeSchema = z.discriminatedUnion('channel', [
  z
    .object({
      id: z.number(),
      agentId: z.string(),
      channel: z.literal('harness'),
      turnId: z.string(),
      event: HarnessEventSchema,
    })
    .strict(),
  z
    .object({
      id: z.number(),
      agentId: z.string(),
      channel: z.literal('daemon'),
      event: DaemonEventSchema,
    })
    .strict(),
])

export type StreamEnvelope = z.infer<typeof StreamEnvelopeSchema>
