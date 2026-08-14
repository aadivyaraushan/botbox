import { z } from 'zod'

export const AgentContextSchema = z
  .object({
    agentId: z.string(),
    workspaceDir: z.string(),
    dataDir: z.string(),
    sessionId: z.string().nullable(),
    inFlightPid: z.number().optional(),
    loginPid: z.number().optional(),
  })
  .strict()

export type AgentContext = z.infer<typeof AgentContextSchema>
