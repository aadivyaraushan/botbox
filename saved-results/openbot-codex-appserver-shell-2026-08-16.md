# OpenBot Codex app-server shell (shipped path)

**Date:** 2026-08-16  
**For:** pass-6 judge gap 1 — pin built-in shell on the shipped transport (`codex app-server`) with camelCase `commandExecution`, not `codex exec --sandbox danger-full-access`  
**Branch:** `openbot/p6-shell`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p6-shell`

## Verdict

**Live app-server built-in shell observed on the shipped argv path.** A real `codex app-server` turn using `buildAppServerArgv` + `buildCodexConfigToml` (permission profile `default_permissions = "openbot"`, no `--sandbox`, config omits `shell_tool = false`) emitted JSON-RPC `item/completed` with `"type":"commandExecution"` and matching stdout.

## What this proves (and what it does not)

| Claim | Result |
|-------|--------|
| Shipped argv (`app-server --listen stdio:// --strict-config`) | Yes |
| No `--sandbox` / danger-full-access | Yes (`assertSafeCodexArgv` + script check) |
| Permission-profile config from `buildCodexConfigToml` | Yes |
| CamelCase item type `commandExecution` + `aggregatedOutput` | Yes (live) |
| Adapter maps that item to Bash tool-use/result | Yes (`test/codex-app-server-shell.test.ts`) |
| Old exec+sandbox script is the product path | **No** — see amended `openbot-codex-builtin-shell-live-2026-08-16.md` |

## Commands

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p6-shell
CODEX_HOME=~/.openbot/codex-home \
  OPENBOT_APPSERVER_SHELL_OUT=/tmp/openbot-appserver-shell-2026-08-16 \
  pnpm exec tsx packages/daemon/scripts/codex-appserver-shell-live.mjs
pnpm --filter @openbot/daemon test -- test/codex-app-server-shell.test.ts
rg commandExecution packages/daemon/test/fixtures/codex
```

Precondition: Codex ChatGPT login under `~/.openbot/codex-home` (`auth.json`). Auth is copied into an isolated agent `CODEX_HOME` for the turn.

## Observed commandExecution (live)

From `/tmp/openbot-appserver-shell-2026-08-16/out.jsonl` (fixture copy: `packages/daemon/test/fixtures/codex/app-server-command-execution.jsonl`):

```json
{"method":"item/completed","params":{"item":{"type":"commandExecution","id":"exec-6dacc73c-abe2-4d00-ab31-ebb42ced79a2","command":"/bin/zsh -lc 'echo openbot-appserver-shell-ok'","aggregatedOutput":"openbot-appserver-shell-ok\n","exitCode":0,"status":"completed"}}}
```

| Field | Value |
|-------|--------|
| argv | `codex app-server --listen stdio:// --strict-config -c model_reasoning_effort=low` |
| item type | `commandExecution` |
| command | `/bin/zsh -lc 'echo openbot-appserver-shell-ok'` |
| stdout (`aggregatedOutput`) | `openbot-appserver-shell-ok\n` |
| exitCode | `0` |
| turn | `turn/completed` |

## Script result

```json
{
  "ok": true,
  "observedCommandExecution": true,
  "itemType": "commandExecution",
  "command": "/bin/zsh -lc 'echo openbot-appserver-shell-ok'",
  "stdout": "openbot-appserver-shell-ok\n",
  "exitCode": 0,
  "turnCompleted": true,
  "usedSandboxFlag": false,
  "configOmitsShellToolFalse": true,
  "note": "Live app-server commandExecution observed (command + stdout) under buildAppServerArgv + permission profile"
}
```

Exit code: **0**.

## Related permission-profile evidence

`packages/daemon/test/fixtures/codex/probe3-write-scope.md` already showed built-in shell under the real permission profile (`default_permissions = "openbot"`, `--strict-config`), including write-deny behavior. That probe used `shell_tool = true` to exercise the profile (honest note in the probe file). This p6 capture adds the **shipped transport** half: app-server camelCase `commandExecution` with default config that **omits** `shell_tool = false`.

## How to reuse

1. Confirm Codex auth under `~/.openbot/codex-home`
2. Run the `codex-appserver-shell-live.mjs` script above via `pnpm exec tsx`
3. Expect `ok: true`, `itemType: "commandExecution"`, stdout containing `openbot-appserver-shell-ok`
4. Re-run `pnpm --filter @openbot/daemon test -- test/codex-app-server-shell.test.ts`
