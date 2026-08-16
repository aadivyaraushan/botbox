# OpenBot Codex built-in shell live observation

**Date:** 2026-08-16  
**For:** p5-shell — observe real Codex `command_execution` (command + stdout), not config-only `restoredBuiltinOk`  
**Branch:** `openbot/p5-shell`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-shell`

## Verdict

**Live built-in shell observed.** A Codex turn with default config (no `shell_tool = false`) emitted `item.completed` type `command_execution` for `echo openbot-builtin-shell-ok`, with matching stdout. Turn finished (`turn.completed`). This is stronger than p4-shell’s config-only `restoredBuiltinOk`.

## Commands

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-shell
CODEX_HOME=~/.openbot/codex-home \
  OPENBOT_BUILTIN_SHELL_OUT=/tmp/openbot-builtin-shell-live-2026-08-16 \
  node packages/daemon/scripts/codex-builtin-shell-live.mjs
pnpm --filter @openbot/daemon test -- test/shell-mcp.test.ts
```

Precondition: `CODEX_HOME=~/.openbot/codex-home codex login status` → Logged in using ChatGPT. Auth is copied from that home into an isolated agent `CODEX_HOME` for the turn (shared home has `auth.json` only; no `config.toml`).

## Observed command_execution

From `/tmp/openbot-builtin-shell-live-2026-08-16/out.jsonl` (also copied to `packages/daemon/test/fixtures/codex/live-builtin-shell-2026-08-16.jsonl`):

```json
{"type":"item.started","item":{"id":"item_2","type":"command_execution","command":"/bin/zsh -c 'echo openbot-builtin-shell-ok'","aggregated_output":"","exit_code":null,"status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"/bin/zsh -c 'echo openbot-builtin-shell-ok'","aggregated_output":"openbot-builtin-shell-ok\n","exit_code":0,"status":"completed"}}
{"type":"turn.completed","usage":{"input_tokens":25140,"cached_input_tokens":12032,"cache_write_input_tokens":0,"output_tokens":100,"reasoning_output_tokens":33}}
```

| Field | Value |
|-------|--------|
| command | `/bin/zsh -c 'echo openbot-builtin-shell-ok'` |
| stdout (`aggregated_output`) | `openbot-builtin-shell-ok\n` |
| exit_code | `0` |
| turn | `turn.completed` |

## Script result

```json
{
  "ok": true,
  "observedCommandExecution": true,
  "command": "/bin/zsh -c 'echo openbot-builtin-shell-ok'",
  "stdout": "openbot-builtin-shell-ok\n",
  "exitCode": 0,
  "turnCompleted": true,
  "shellToolFalse": false,
  "configOmitsShellToolFalse": true,
  "sharedCodexHome": "/Users/aadivyar/.openbot/codex-home",
  "note": "Live built-in command_execution observed (command + stdout)"
}
```

Exit code: **0**.

## Default OpenBot config

`buildCodexConfigToml` without `shellToolFalse: true` still **omits** `shell_tool = false` (asserted in `packages/daemon/test/shell-mcp.test.ts`). Probe agent config used the same omit rule.

## Contrast with p4-shell

p4-shell (`saved-results/openbot-codex-shell-live-verify-2026-08-15.md`) exited 0 on `restoredBuiltinOk: true` with `builtinBashSeen: false`, `turnFinished: false` — config omit only. This p5 run shows the built-in tool actually firing.

## How to reuse

1. Confirm Codex auth under `~/.openbot/codex-home`
2. Run the script above
3. Expect `ok: true`, `observedCommandExecution: true`, stdout containing `openbot-builtin-shell-ok`
