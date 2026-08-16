import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCodexConfigToml } from '../src/codex/config.js'
import { codexItemToolName } from '../src/codex/adapter.js'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/codex')
const MARKER = 'openbot-builtin-shell-ok'

describe('codex built-in shell live fixture', () => {
  it('default config omits shell_tool=false', () => {
    const toml = buildCodexConfigToml({
      agentId: 'a',
      mcpToken: 'tok',
      mcpPort: 8799,
      hindsightPort: 8888,
      memoryBankId: 'bank',
      home: '/tmp/openbot-home',
      otherAgentDirs: [],
    })
    expect(toml).not.toContain('shell_tool = false')
  })

  it('live JSONL records command_execution with marker command and stdout', () => {
    const jsonl = fs.readFileSync(
      path.join(fixtureDir, 'live-builtin-shell-2026-08-16.jsonl'),
      'utf8',
    )
    const completed = jsonl
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as {
        type: string
        item?: {
          type?: string
          command?: string
          aggregated_output?: string
          exit_code?: number | null
          status?: string
        }
      })
      .filter(
        (m) =>
          m.type === 'item.completed' &&
          m.item?.type === 'command_execution' &&
          String(m.item.command).includes(MARKER),
      )
    expect(completed.length).toBeGreaterThanOrEqual(1)
    const item = completed[0]!.item!
    expect(item.aggregated_output).toContain(MARKER)
    expect(item.exit_code).toBe(0)
    expect(item.status).toBe('completed')
    expect(codexItemToolName({ type: 'command_execution' })).toBe('Bash')
    expect(jsonl).toContain('"type":"turn.completed"')
  })

  it('live result.json marks observedCommandExecution', () => {
    const result = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, 'live-builtin-shell-2026-08-16-result.json'), 'utf8'),
    ) as {
      ok: boolean
      observedCommandExecution: boolean
      command: string
      stdout: string
      configOmitsShellToolFalse: boolean
    }
    expect(result.ok).toBe(true)
    expect(result.observedCommandExecution).toBe(true)
    expect(result.command).toContain(MARKER)
    expect(result.stdout).toContain(MARKER)
    expect(result.configOmitsShellToolFalse).toBe(true)
  })
})
