import { describe, expect, it } from 'vitest'
import { SHELL_RUN_DESC } from '../src/mcp-browser/tools.js'
import { buildClaudeShellOptions } from '../src/claude/adapter.js'
import { buildCodexConfigToml } from '../src/codex/config.js'
import { codexItemToolName } from '../src/codex/adapter.js'

describe('shell-mcp', () => {
  it('pins shell_run description', () => {
    expect(SHELL_RUN_DESC).toBe(
      'Run a shell command in a visible Terminal tab for this agent. Never steals focus. Write-deny still applies.',
    )
  })

  it('preferred path: toolAliases present → Bash aliased to mcp__openbot__shell_run', () => {
    const opts = buildClaudeShellOptions({ toolAliasesAvailable: true })
    expect(opts.toolAliases).toEqual({ Bash: 'mcp__openbot__shell_run' })
    expect(opts.disallowedTools ?? []).not.toContain('Bash')
  })

  it('fallback: SDK types without toolAliases → no alias key; Bash not in disallowedTools', () => {
    const opts = buildClaudeShellOptions({ toolAliasesAvailable: false })
    expect(opts.toolAliases).toBeUndefined()
    expect(opts.disallowedTools ?? []).not.toContain('Bash')
  })

  it('default Codex omits shell_tool=false (capability-first until live MCP proof)', () => {
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

  it('preferred Codex: shellToolFalse true → shell_tool = false in config.toml', () => {
    const toml = buildCodexConfigToml({
      agentId: 'a',
      mcpToken: 'tok',
      mcpPort: 8799,
      hindsightPort: 8888,
      memoryBankId: 'bank',
      home: '/tmp/openbot-home',
      otherAgentDirs: [],
      shellToolFalse: true,
    })
    expect(toml).toContain('shell_tool = false')
  })

  it('fallback: shellToolFalse false omits shell_tool=false; command_execution still maps', () => {
    const toml = buildCodexConfigToml({
      agentId: 'a',
      mcpToken: 'tok',
      mcpPort: 8799,
      hindsightPort: 8888,
      memoryBankId: 'bank',
      home: '/tmp/openbot-home',
      otherAgentDirs: [],
      shellToolFalse: false,
    })
    expect(toml).not.toContain('shell_tool = false')
    expect(codexItemToolName({ type: 'command_execution' })).toBe('Bash')
    expect(codexItemToolName({ type: 'mcp_tool_call', tool: 'shell_run' })).toBe('shell_run')
  })
})
