export type CodexExecKind = 'compact' | 'resume' | 'main-exec'

export function buildCodexExecArgv(opts: {
  kind: CodexExecKind
  prompt: string
  model?: string
  effort?: string
  threadId?: string
}): string[] {
  const argv: string[] = ['exec']
  if (opts.kind === 'resume') {
    if (!opts.threadId) throw new Error('resume requires threadId')
    argv.push('resume', opts.threadId, opts.prompt)
  } else {
    argv.push(opts.prompt)
  }
  argv.push(
    '--json',
    '--strict-config',
    '--dangerously-bypass-hook-trust',
    '--skip-git-repo-check',
  )
  if (opts.model) argv.push('--model', opts.model)
  if (opts.effort) argv.push('-c', `model_reasoning_effort=${opts.effort}`)
  return argv
}

export function buildAppServerArgv(opts?: { effort?: string }): string[] {
  const argv = ['app-server', '--listen', 'stdio://', '--strict-config']
  if (opts?.effort) argv.push('-c', `model_reasoning_effort=${opts.effort}`)
  return argv
}

export function buildCodexArgv(
  kind: 'app-server' | 'compact' | 'resume',
  opts: { prompt?: string; model?: string; effort?: string; threadId?: string } = {},
): string[] {
  if (kind === 'app-server') return buildAppServerArgv(opts)
  return buildCodexExecArgv({
    kind: kind === 'resume' ? 'resume' : 'compact',
    prompt: opts.prompt ?? '',
    model: opts.model,
    effort: opts.effort,
    threadId: opts.threadId,
  })
}

export function assertSafeCodexArgv(argv: string[]): void {
  if (argv.includes('--sandbox')) throw new Error('forbidden --sandbox')
  if (argv.includes('--effort')) throw new Error('forbidden --effort')
  if (!argv.includes('--strict-config')) throw new Error('missing --strict-config')
}
