import { z } from 'zod'

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

const UsageSchema = z
  .object({
    costUsd: z.number().nullable(),
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    contextWindow: z.number().optional(),
  })
  .strict()

export const HarnessEventSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('turn-started'),
      sessionId: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('turn-created'),
      turnId: z.string(),
      seq: z.number(),
      role: z.enum(['user', 'assistant', 'system']),
      source: z.string(),
      createdAt: z.string(),
      harness: z.string().optional(),
      text: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('reasoning-text'),
      partId: z.string(),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('assistant-text'),
      partId: z.string(),
      delta: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tool-use'),
      callId: z.string(),
      name: z.string(),
      inputSummary: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('tool-result'),
      callId: z.string(),
      name: z.string(),
      ok: z.boolean(),
      outputSummary: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('compacted'),
      partId: z.string(),
      reason: z.enum(['harness-switch', 'manual', 'clear']),
      forHarness: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('turn-finished'),
      sessionId: z.string(),
      outcome: z.enum(['complete', 'interrupted', 'error']),
      errorMessage: z.string().optional(),
      usage: UsageSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('error'),
      message: z.string(),
      fatal: z.boolean(),
      code: z.enum(['cli-fatal', 'interrupted']).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('peer-message'),
      partId: z.string(),
      peerAgentId: z.string(),
      peerName: z.string(),
      direction: z.enum(['sent', 'received']),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ask-user-question'),
      partId: z.string(),
      questions: z.array(AskQuestionSchema),
      status: z.enum(['open', 'answered', 'cancelled']),
      answers: z.record(z.string(), z.string()).optional(),
      response: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ask-user-question-status'),
      partId: z.string(),
      status: z.enum(['answered', 'cancelled']),
    })
    .strict(),
])

export type HarnessEvent = z.infer<typeof HarnessEventSchema>
