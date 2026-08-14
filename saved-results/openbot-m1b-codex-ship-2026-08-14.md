# OpenBot M1b Codex ship

- **Date:** 2026-08-14
- **What for:** Record M1b Codex adapter ship gates after auth blocker cleared
- **PR:** https://github.com/aadivyaraushan/botbox/pull/4
- **Branch / worktree:** `openbot/m1b-codex` @ `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1b`

## Result

- Probes 1+3 PASS; probe 2 FAIL → revise to app-server (fixtures under `packages/daemon/test/fixtures/codex/`)
- Tests: 68 passed; coverage lines **80.38%**; `pnpm typecheck` green
- Real: app-server turn + `codex exec resume` → REAL_TURN_OK / REAL_RESUME_OK
- Inbox: `orchestrate/openbot/inbox/m1b-codex-report.md`

## Reproduce

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1b
CODEX_HOME=/Users/aadivyar/.openbot/codex-home codex login status
pnpm --filter @openbot/daemon test --coverage
pnpm typecheck
```
