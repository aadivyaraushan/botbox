import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type CodexConfigInput = {
  agentId: string
  mcpToken: string
  mcpPort: number
  hindsightPort: number
  memoryBankId: string
  home: string
  otherAgentDirs: string[]
  /** Prefer MCP shell when true (default). Omit shell_tool=false on failed probe. */
  shellToolFalse?: boolean
}

function tomlKey(absPath: string): string {
  return JSON.stringify(absPath)
}

/** Build per-agent Codex config.toml (permission profiles; never writable_roots homeDir). */
export function buildCodexConfigToml(input: CodexConfigInput): string {
  const home = input.home || os.homedir()
  const lines: string[] = [
    'approval_policy = "never"',
    'default_permissions = "openbot"',
    'suppress_unstable_features_warning = true',
    '',
    '[features]',
    'default_mode_request_user_input = true',
    ...(input.shellToolFalse === false ? [] : ['shell_tool = false']),
    '',
    '[permissions.openbot]',
    'description = "OpenBot agent"',
    '',
    '[permissions.openbot.filesystem]',
    '":root" = "write"',
  ]
  for (const dir of input.otherAgentDirs) {
    lines.push(`${tomlKey(dir)} = "read"`)
  }
  for (const d of [
    path.join(home, 'private'),
    path.join(home, 'claude-config'),
    path.join(home, 'codex-home'),
    path.join(home, 'hindsight'),
    path.join(home, 'team.json'),
    path.join(home, 'login-url'),
  ]) {
    lines.push(`${tomlKey(d)} = "deny"`)
  }
  lines.push(
    '',
    '[permissions.openbot.network]',
    'enabled = true',
    '',
    '[mcp_servers.openbot]',
    `url = "http://127.0.0.1:${input.mcpPort}/mcp/${input.agentId}?token=${input.mcpToken}"`,
    'tool_timeout_sec = 3600',
    '',
    '[mcp_servers.hindsight]',
    `url = "http://127.0.0.1:${input.hindsightPort}/mcp/${input.memoryBankId}/"`,
    'tool_timeout_sec = 3600',
    '',
  )
  return lines.join('\n')
}

export function assertNoHomeDirWritableRoots(toml: string): void {
  if (/writable_roots\s*=\s*\[[^\]]*homeDir/i.test(toml)) {
    throw new Error('forbidden writable_roots homeDir')
  }
}

export async function writeCodexConfig(args: {
  agentCodexHome: string
  input: CodexConfigInput
}): Promise<string> {
  await fs.mkdir(args.agentCodexHome, { recursive: true })
  const toml = buildCodexConfigToml(args.input)
  assertNoHomeDirWritableRoots(toml)
  const dest = path.join(args.agentCodexHome, 'config.toml')
  await fs.writeFile(dest, toml, 'utf8')
  return toml
}
