# OpenBot Codex shell live verify (capability-first)

**Date:** 2026-08-15  
**For:** p4-shell / Judge G6 — never ship `shell_tool = false` without live MCP `shell_run` proof.  
**Branch:** `openbot/p4-shell`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-shell`

## Verdict

**Restored built-in shell.** Preferred MCP path was not proven live. Default Codex config now **omits** `shell_tool = false` unless `shellToolFalse: true` is passed explicitly.

## Commands

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-shell
pnpm --filter @openbot/daemon test
CODEX_HOME=~/.openbot/codex-home OPENBOT_PORT=18880 OPENBOT_SKIP_HINDSIGHT=1 \
  node packages/daemon/scripts/codex-shell-live-verify.mjs
```

Precondition: `CODEX_HOME=~/.openbot/codex-home codex login status` → Logged in using ChatGPT.

## Live result (this session)

```json
{
  "ok": true,
  "preferredPathOk": false,
  "restoredBuiltinOk": true,
  "shellToolFalse": false,
  "mcpShellRunSeen": false,
  "builtinBashSeen": false,
  "terminalRunSeen": false,
  "turnFinished": false,
  "configHasShellToolFalse": false,
  "note": "Preferred MCP path not proven live; restored built-in (omit shell_tool=false)"
}
```

Exit code: **0**. Log: `/tmp/openbot-codex-shell-live-verify.out` / `.err`.

## Earlier preferred-path attempt (failed)

With prior default `shell_tool = false`, a full Codex turn against a stub app answering `terminal.run` did **not** emit MCP `shell_run` / `terminal.run` (`mcpShellRunSeen: false`, `terminalRunSeen: false`, `turnFinished: false` after ~180s). Codex logged fatal Hindsight MCP transport errors to `127.0.0.1:8888` while `OPENBOT_SKIP_HINDSIGHT=1`. No live fixture showed `mcp_tool_call` / `shell_run` succeeding.

## Code change

`packages/daemon/src/codex/config.ts`:

- Before: emit `shell_tool = false` unless `shellToolFalse === false`
- After: emit `shell_tool = false` **only** when `shellToolFalse === true`

Tests in `shell-mcp.test.ts` and `codex.test.ts` assert the default omits the flag; preferred path still available via explicit `shellToolFalse: true`.

## How to reuse

1. Confirm Codex auth under `~/.openbot/codex-home`
2. Run the live script above
3. Expect `ok: true` and either `preferredPathOk` or `restoredBuiltinOk`
