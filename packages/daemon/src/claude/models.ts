import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type ModelEntry = {
  id: string
  displayName: string
  efforts?: string[]
  contextWindow?: number
}

const DEFAULT_CLAUDE: ModelEntry[] = [
  {
    id: 'claude-sonnet-5',
    displayName: 'Sonnet 5',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: 1_000_000,
  },
]

const DEFAULT_CODEX: ModelEntry[] = [
  { id: 'gpt-5.6-luna', displayName: 'GPT-5.6 Luna', efforts: ['low', 'medium', 'high'] },
]

export function loadClaudeCatalog(modelsPath?: string): ModelEntry[] {
  const p =
    modelsPath ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'models.json')
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as ModelEntry[]
    return raw.map((m) => ({
      ...m,
      efforts: m.efforts ?? ['low', 'medium', 'high', 'xhigh', 'max'],
    }))
  } catch {
    return DEFAULT_CLAUDE
  }
}

export function loadCodexCatalog(home: string): ModelEntry[] {
  const cache = path.join(home, 'codex-models.json')
  if (!fs.existsSync(cache)) {
    console.error('[models] catalog-missing harness=codex')
    return DEFAULT_CODEX
  }
  try {
    const raw = JSON.parse(fs.readFileSync(cache, 'utf8')) as ModelEntry[]
    return raw.filter((m) => m.id !== 'codex-auto-review' && !m.id.includes('non-list'))
  } catch {
    console.error('[models] catalog-missing harness=codex')
    return DEFAULT_CODEX
  }
}

export function contextWindowFor(modelId: string, catalog: ModelEntry[]): number | undefined {
  return catalog.find((m) => m.id === modelId)?.contextWindow
}
