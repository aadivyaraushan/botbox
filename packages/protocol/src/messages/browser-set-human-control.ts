import { z } from 'zod'

export const BrowserSetHumanControlRequestSchema = z
  .object({
    type: z.literal('browser.setHumanControl'),
    agentId: z.string(),
    held: z.boolean(),
  })
  .strict()

export type BrowserSetHumanControlRequest = z.infer<typeof BrowserSetHumanControlRequestSchema>

export const BrowserSetHumanControlResponseSchema = z.discriminatedUnion('ok', [
  z
    .object({
      ok: z.literal(true),
      held: z.boolean(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found']),
    })
    .strict(),
])

export type BrowserSetHumanControlResponse = z.infer<typeof BrowserSetHumanControlResponseSchema>
