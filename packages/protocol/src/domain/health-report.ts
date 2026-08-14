import { z } from 'zod'
import { HarnessAuthSchema } from './agent-runtime'

export const HealthReportSchema = z
  .object({
    ok: z.boolean(),
    error: z.string().optional(),
    harnessAuth: HarnessAuthSchema,
  })
  .strict()

export type HealthReport = z.infer<typeof HealthReportSchema>
