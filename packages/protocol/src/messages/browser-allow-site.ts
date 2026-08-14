import { z } from 'zod'

export const BrowserAllowSiteRequestSchema = z
  .object({
    type: z.literal('browser.allowSite'),
    agentId: z.string(),
    host: z.string(),
    allow: z.boolean(),
  })
  .strict()

export type BrowserAllowSiteRequest = z.infer<typeof BrowserAllowSiteRequestSchema>

export const BrowserAllowSiteResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum(['agent-not-found', 'not-open']),
    })
    .strict(),
])

export type BrowserAllowSiteResponse = z.infer<typeof BrowserAllowSiteResponseSchema>
