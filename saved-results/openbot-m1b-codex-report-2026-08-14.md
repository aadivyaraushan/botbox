# M1b Codex adapter — inbox report

- **Date:** 2026-08-14
- **Branch:** `openbot/m1b-codex`
- **Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1b`
- **PR:** https://github.com/aadivyaraushan/botbox/pull/4
- **Status:** DONE

## Auth (cleared; not re-logged)

```text
CODEX_HOME=/Users/aadivyar/.openbot/codex-home codex login status
→ Logged in using ChatGPT
auth.json: ~/.openbot/codex-home/auth.json exists
```

## Probes (locked order)

| # | Probe | Result |
|---|--------|--------|
| 1 | `codex exec --json` + MCP | PASS — `packages/daemon/test/fixtures/codex/turn-completed.jsonl` / `probe1-json-mcp.jsonl` |
| 2 | `request_user_input` + exec stdin | FAIL → revise — exec rejects ask; fixtures `request-user-input-exec-rejected.*`, `probe2-REVISE-TO-APP-SERVER.md` |
| 2b | App-server ask roundtrip | PASS — `request-user-input.jsonl`, `probe4-app-server-ask.jsonl` |
| 3 | Write-scope `--strict-config` | PASS — `probe3-write-scope.md` |

**Plan revise:** main Codex turns + asks use `codex app-server --listen stdio:// --strict-config` (JSON-RPC). Compact may use `codex exec --json`. Answers are JSON-RPC responses to `item/tool/requestUserInput`, not exec stdin. See `saved-results/openbot-m1b-codex-probe-revise-2026-08-14.md` and plan §3.5 / §8 M1b.

## Implementation

- `packages/daemon/src/codex/{adapter,ask,auth,config,exec-argv}.ts`
- `packages/daemon/src/harness/{switch,compact}.ts`
- Daemon wiring: Codex turns, `agent.setHarness` / `agent.setModel`, auth detect via shared `auth.json`
- Absolute-path permission profiles; **never** `writable_roots=["homeDir"]`
- Default model `gpt-5.6-luna`; argv `--model` + `--strict-config` + `-c model_reasoning_effort=<effort>` when set
- Paused harness switch only keeps/rewrites `stopped-turn.json` fields per plan

## Evidence gates

### Unit / coverage / typecheck

```text
pnpm --filter @openbot/daemon test --coverage
→ Test Files  18 passed (18)
→ Tests       68 passed (68)
→ All files   lines 80.38% (≥80 threshold)

pnpm typecheck
→ packages/protocol Done
→ packages/daemon Done  (tsconfig includes test/**/*.ts)
```

### Real surface

- App-server turn → `REAL_TURN_OK` / `OPENBOT_M1B_OK`
- `codex exec resume <thread_id>` → `REAL_RESUME_OK` / `OPENBOT_M1B_RESUME_OK` (exit 0)
- Fixtures: `packages/daemon/test/fixtures/codex/real-turn-resume-evidence.md`, `live-*.json(l|txt)`

## Out of scope (not touched)

- `packages/app` (untracked leftover in worktree; not committed)
- Remote / VPS / API-key paths
- Rebase / gt / force-push

## Report path

`/Users/aadivyar/.cursor/projects/Users-aadivyar-Documents-Startups-grok-bot-clone/orchestrate/openbot/inbox/m1b-codex-report.md`
