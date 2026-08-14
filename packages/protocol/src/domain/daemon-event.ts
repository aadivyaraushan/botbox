import { z } from 'zod'
import { AgentRuntimeSchema } from './agent-runtime'
import { HarnessIdSchema } from './agent'

const httpUrl = z.string().url().refine((u) => u.startsWith('http://') || u.startsWith('https://'))

const bannerActions = z.array(
  z.enum(['pause', 'resume', 'dismiss', 'log-in', 'allow-site', 'deny-site', 'retry-memory']),
)

export const BannerSchema = z.discriminatedUnion('type', [
  z
    .object({
      kind: z.literal('banner'),
      bannerId: z.string(),
      agentId: z.string(),
      type: z.literal('needs-login'),
      harness: HarnessIdSchema,
      message: z.string(),
      actions: bannerActions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('banner'),
      bannerId: z.string(),
      agentId: z.string(),
      type: z.literal('disk-warn'),
      message: z.string(),
      actions: bannerActions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('banner'),
      bannerId: z.string(),
      agentId: z.string(),
      type: z.literal('needs-site'),
      host: z.string(),
      message: z.string(),
      actions: bannerActions,
    })
    .strict(),
  z
    .object({
      kind: z.literal('banner'),
      bannerId: z.string(),
      agentId: z.string(),
      type: z.literal('memory-error'),
      message: z.string(),
      actions: bannerActions,
    })
    .strict(),
])

export type Banner = z.infer<typeof BannerSchema>

export const DaemonEventSchema = z.union([
  z
    .object({
      kind: z.literal('agent-runtime'),
      runtime: AgentRuntimeSchema,
    })
    .strict(),
  BannerSchema,
  z
    .object({
      kind: z.literal('login-challenge'),
      agentId: z.string(),
      harness: HarnessIdSchema,
      url: httpUrl,
      userCode: z.string().optional(),
      needsPasteCode: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('login-finished'),
      agentId: z.string(),
      harness: HarnessIdSchema,
      ok: z.boolean(),
      error: z.string().optional(),
    })
    .strict(),
])

export type DaemonEvent = z.infer<typeof DaemonEventSchema>
