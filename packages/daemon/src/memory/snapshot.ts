import fs from 'node:fs/promises'
import path from 'node:path'
import type { Turn } from '@openbot/protocol'
import { turnText } from '../turns/reducer.js'
import type { HindsightClient } from './hindsight-client.js'

const SNAPSHOT_CAP = 16_000
const TIMEOUT_MS = 120_000

export async function retainAndSnapshot(opts: {
  client: HindsightClient
  bankId: string
  agentId: string
  agentDir: string
  turn: Turn
}): Promise<{ ok: boolean }> {
  const content = turnText(opts.turn)
  const memoryPath = path.join(opts.agentDir, 'MEMORY.md')
  let prior: string | null = null
  try {
    prior = await fs.readFile(memoryPath, 'utf8')
  } catch {
    prior = null
  }

  const work = (async () => {
    const retain = await opts.client.retain(opts.bankId, content)
    if (!retain.ok) throw new Error(retain.error)
    const recall = await opts.client.recall(opts.bankId, 'durable facts worth recalling later', 4000)
    if (!recall.ok) throw new Error(recall.error)
    const bullets = recall.results.map((r) => `- ${r.text}`).join('\n')
    const clipped = bullets.length > SNAPSHOT_CAP ? bullets.slice(0, SNAPSHOT_CAP) : bullets
    await fs.writeFile(memoryPath, clipped + (clipped.endsWith('\n') ? '' : '\n'), 'utf8')
  })()

  try {
    await Promise.race([
      work,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT_MS)),
    ])
    return { ok: true }
  } catch (e) {
    console.error(`[memory] agent=${opts.agentId} failed`, e)
    if (prior !== null) {
      await fs.writeFile(memoryPath, prior, 'utf8').catch(() => {})
    }
    return { ok: false }
  }
}

export function formatRecallBlock(results: Array<{ text: string }>): string {
  if (!results.length) return ''
  return (
    '\n\n# Recalled memory\n' + results.map((r) => `- ${r.text}`).join('\n')
  )
}
