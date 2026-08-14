import { z } from 'zod'

export const HarnessIdSchema = z.enum(['claude-code', 'codex'])
export type HarnessId = z.infer<typeof HarnessIdSchema>

export const AgentSlugSchema = z
  .string()
  .regex(/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/)

export const AgentConfigSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: AgentSlugSchema,
    harness: HarnessIdSchema,
    model: z.string(),
    effort: z.string().optional(),
    fast: z.boolean().optional(),
    memoryBankId: z.string(),
    createdAt: z.string(),
  })
  .strict()

export type AgentConfig = z.infer<typeof AgentConfigSchema>
