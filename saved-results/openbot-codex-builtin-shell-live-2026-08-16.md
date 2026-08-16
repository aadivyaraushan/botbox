# OpenBot Codex built-in shell — OFF-PATH historical note (exec + sandbox)

**Date:** 2026-08-16 (amended same day for pass-6 gap 1)  
**For:** archival record of the p5-shell run that observed a real shell command  
**Status:** **Not the shipped path.** Do not cite this as product proof.

## Honest title (amended)

This run used **`codex exec`** with **`--sandbox danger-full-access`** and a hand-rolled `config.toml` that set `sandbox_mode = "danger-full-access"` with **no** `default_permissions` / `[permissions.openbot]` block. That is **not** what OpenBot ships for main turns.

- Shipped main/ask/resume argv: `buildAppServerArgv` → `app-server --listen stdio:// --strict-config` (no `--sandbox`; `assertSafeCodexArgv` throws on that flag).
- Shipped config: `buildCodexConfigToml` with `default_permissions = "openbot"` and permission filesystem keys; default **omits** `shell_tool = false`.

**Shipped-path evidence:** `saved-results/openbot-codex-appserver-shell-2026-08-16.md`  
**Shipped-path script:** `packages/daemon/scripts/codex-appserver-shell-live.mjs`  
**CamelCase fixture:** `packages/daemon/test/fixtures/codex/app-server-command-execution.jsonl`

The archival script `packages/daemon/scripts/codex-builtin-shell-live.mjs` now **refuses to run** unless `OPENBOT_ALLOW_OFFPATH_EXEC_SANDBOX_PROOF=1`.

## What the p5 run still showed (limited)

A real command ran under exec+sandbox-off: snake_case `command_execution` for `echo openbot-builtin-shell-ok` with matching stdout and `turn.completed`. That beats config-only `restoredBuiltinOk`, but it does **not** exercise app-server or the permission-profile gate.

## Original commands (historical)

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-shell
CODEX_HOME=~/.openbot/codex-home \
  OPENBOT_BUILTIN_SHELL_OUT=/tmp/openbot-builtin-shell-live-2026-08-16 \
  OPENBOT_ALLOW_OFFPATH_EXEC_SANDBOX_PROOF=1 \
  node packages/daemon/scripts/codex-builtin-shell-live.mjs
```

## Observed (exec JSONL, snake_case)

From `packages/daemon/test/fixtures/codex/live-builtin-shell-2026-08-16.jsonl`:

```json
{"type":"item.completed","item":{"id":"item_2","type":"command_execution","command":"/bin/zsh -c 'echo openbot-builtin-shell-ok'","aggregated_output":"openbot-builtin-shell-ok\n","exit_code":0,"status":"completed"}}
```

## Related stronger config-gate evidence

`probe3-write-scope` already showed built-in shell under the real permission profile (`default_permissions = "openbot"`, `--strict-config`). Probe3 used `shell_tool = true` to exercise that profile — see `packages/daemon/test/fixtures/codex/probe3-write-scope.md`.
