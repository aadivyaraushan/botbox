# OpenBot M1b Codex probes + ask-path revise

**Date:** 2026-08-14  
**For:** M1b Codex adapter (`openbot/m1b-codex`)  
**CLI:** `codex-cli 0.147.0`  
**Auth:** `CODEX_HOME=~/.openbot/codex-home` → Logged in using ChatGPT; `auth.json` present.

## Probe results

| # | Probe | Result | Evidence |
|---|--------|--------|----------|
| 1 | `codex exec --json` + MCP stub | PASS | `packages/daemon/test/fixtures/codex/turn-completed.jsonl` |
| 2 | `request_user_input` + exec stdin | FAIL → revise | `request-user-input-exec-rejected.*` |
| 2b | app-server ask roundtrip | PASS | `request-user-input.jsonl`, turn continued `DONE_ASK` |
| 3 | write-scope `--strict-config` | PASS | `probe3-write-scope.md` |

## Revise

Main Codex turns + ask use `codex app-server` JSON-RPC (`item/tool/requestUserInput` + JSON-RPC response). Never answer asks via exec stdin. Never `writable_roots=["homeDir"]`. Verify: app-server turn + `codex exec resume <thread_id>`.
