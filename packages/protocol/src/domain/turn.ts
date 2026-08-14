import { z } from 'zod'
import { HarnessIdSchema } from './agent'

const AskOptionSchema = z
  .object({
    label: z.string(),
    description: z.string(),
  })
  .strict()

const AskQuestionSchema = z
  .object({
    question: z.string(),
    header: z.string(),
    options: z.array(AskOptionSchema),
    multiSelect: z.boolean(),
  })
  .strict()

export const TurnPartSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      id: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reasoning'),
      id: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('tool'),
      id: z.string(),
      name: z.string(),
      inputSummary: z.string(),
      outputSummary: z.string().optional(),
      ok: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('compaction'),
      id: z.string(),
      reason: z.enum(['harness-switch', 'manual', 'clear']),
      forHarness: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('peer-message'),
      id: z.string(),
      peerAgentId: z.string(),
      peerName: z.string(),
      direction: z.enum(['sent', 'received']),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal('ask-user-question'),
      id: z.string(),
      questions: z.array(AskQuestionSchema),
      status: z.enum(['open', 'answered', 'cancelled']),
      answers: z.record(z.string(), z.string()).optional(),
      response: z.string().optional(),
    })
    .strict(),
])

export type TurnPart = z.infer<typeof TurnPartSchema>

export const TurnSourceSchema = z.enum([
  'user',
  'peer',
  'harness-switch-compact',
  'memory-writer',
  'compact',
  'inject',
  'clear',
  'resume-continue',
])

export const TurnSchema = z
  .object({
    id: z.string(),
    seq: z.number(),
    agentId: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    harness: HarnessIdSchema.optional(),
    source: TurnSourceSchema,
    hidden: z.boolean().optional(),
    outcome: z.enum(['complete', 'interrupted', 'error']).optional(),
    errorMessage: z.string().optional(),
    errorCode: z.string().optional(),
    costUsd: z.number().nullable().optional(),
    parts: z.array(TurnPartSchema),
    createdAt: z.string(),
  })
  .strict()

export type Turn = z.infer<typeof TurnSchema>
