# OpenBot M3 ask cards verification

**Date:** 2026-08-15  
**For:** Durable M3 (AskUserQuestion / Codex ask cards) evidence after pass-3 judge asked for a committed record.  
**Branch:** `openbot/p3-artifacts`  
**Related PR (feature):** https://github.com/aadivyaraushan/botbox/pull/7 (`e114622`)

## GateGuard facts (this file)

1. **Callers (not imported by code):** orchestrate brief `briefs/p3-artifacts.md` lines 12–16; orch checkpoint `saved-results/openbot-orch-program-2026-08-14.md` Pass-3 artifacts section; inbox `p3-artifacts-report.md`. Human/orch readers only.
2. **No duplicate:** Glob/ls found no `saved-results/openbot-m3-ask-cards*` in worktree or primary before this write. Closest siblings are `openbot-codex-live-verify-2026-08-15.md` (Codex live JSON) and inbox `m3-ask-cards-report.md` (ephemeral orch inbox, not repo).
3. **Data shape:** Markdown record only. Tables of surface/status/evidence. Dates as `YYYY-MM-DD`. No production data files.
4. **User instruction (verbatim):** "Add `saved-results/openbot-m3-ask-cards-2026-08-15.md`: Playwright ask suite green; real ask via Codex live evidence (`openbot-codex-live-verify-2026-08-15.md`); Claude ask deferred (`m1-smoke-max-pro`). No credential copy."

## Verdict

| Surface | Status | Evidence |
|---|---|---|
| Playwright ask suite | Green | `packages/app/e2e/ask.spec.ts` — **6** tests (see below) |
| Real ask (Codex) | Proven | `saved-results/openbot-codex-live-verify-2026-08-15.md` — `askSeen: true` |
| Real ask (Claude AskUserQuestion) | Deferred | Gate `m1-smoke-max-pro` (weekly / Max-Pro limit). Not claimed done. |
| Credential copy | Forbidden | No `~/.claude/.credentials.json` copy (ban landed in PR #15) |

## Playwright `ask.spec.ts` (6 tests)

Inbox `m3-ask-cards-report.md` recorded locally:

```text
pnpm --filter @openbot/app test:e2e --project=ci e2e/ask.spec.ts → 6 passed
```

CI on PR #7 (`31825891712`): **test** and **app-e2e** green.

Tests in `packages/app/e2e/ask.spec.ts`:

1. fixture ask-user-question renders options  
2. one-question click sends ask.answer keyed on question text  
3. two-question card waits for second answer before ask.answer  
4. multiSelect requires Done  
5. Other sends typed text as the answer value  
6. Answer in chat instead then composer send uses response  

Full ci project later stayed green at **27** tests × 10 runs (`saved-results/openbot-p2-e2e-stability-2026-08-15.md`), which includes this ask suite.

## Real ask via Codex (live)

From `saved-results/openbot-codex-live-verify-2026-08-15.md`:

```json
{
  "ok": true,
  "harness": "codex",
  "turnFinished": true,
  "askSeen": true,
  "askPartId": "call_QoFcKBovw8qF9ToNbUg80ja7",
  "askError": null
}
```

Command (no Claude credential copy):

```bash
CODEX_HOME=~/.openbot/codex-home OPENBOT_HOME=~/.openbot OPENBOT_PORT=18866 \
  node packages/daemon/scripts/codex-live-verify.mjs
```

Precondition: `CODEX_HOME=~/.openbot/codex-home codex login status` → `Logged in using ChatGPT`.

## Claude AskUserQuestion live — deferred

Gate `m1-smoke-max-pro` remains open. M3 worker report noted OpenBot Claude login under `CLAUDE_CONFIG_DIR` was unavailable (Keychain-only Mac login does not transfer). Pass-2 banned copying `~/.claude/.credentials.json`. This record does **not** invent Claude live ask evidence.

## No credential copy

Fail-closed: do not copy `~/.claude/.credentials.json` into OpenBot paths. Harness auth is account login per `e2e/computer-use/harness-login.md`. Codex live used `~/.openbot/codex-home` only.

## How to re-verify

```bash
pnpm --filter @openbot/app test:e2e --project=ci e2e/ask.spec.ts
# expect 6 passed

CODEX_HOME=~/.openbot/codex-home OPENBOT_HOME=~/.openbot \
  node packages/daemon/scripts/codex-live-verify.mjs
# expect ok:true and askSeen:true
```

<!-- GateGuard: durable M3 evidence. Callers: briefs/p3-artifacts.md, orch program, human review. -->
