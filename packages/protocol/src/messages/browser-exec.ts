import { z } from 'zod'

const base = {
  type: z.literal('browser.exec'),
  agentId: z.string(),
  allowedHosts: z.array(z.string()),
}

export const BrowserExecRequestSchema = z.discriminatedUnion('op', [
  z
    .object({
      ...base,
      op: z.literal('navigate'),
      url: z.string(),
    })
    .strict(),
  z
    .object({
      ...base,
      op: z.literal('snapshot'),
    })
    .strict(),
  z
    .object({
      ...base,
      op: z.literal('click'),
      ref: z.string(),
    })
    .strict(),
  z
    .object({
      ...base,
      op: z.literal('type'),
      ref: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      ...base,
      op: z.literal('screenshot'),
    })
    .strict(),
])

export type BrowserExecRequest = z.infer<typeof BrowserExecRequestSchema>

const OkResultSchema = z.union([
  z
    .object({
      url: z.string(),
      title: z.string(),
    })
    .strict(),
  z
    .object({
      yaml: z.string(),
    })
    .strict(),
  z
    .object({
      pngBase64: z.string(),
    })
    .strict(),
])

export const BrowserExecResponseSchema = z.union([
  z
    .object({
      ok: z.literal(true),
      result: OkResultSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.literal('cross-site'),
      url: z.string(),
      host: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.literal('nav-failed'),
      errorCode: z.number(),
      errorDescription: z.string(),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum([
        'human-control-held',
        'unknown-agent',
        'unknown-ref',
        'op-failed',
      ]),
    })
    .strict(),
])

export type BrowserExecResponse = z.infer<typeof BrowserExecResponseSchema>
