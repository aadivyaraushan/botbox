# OpenBot M0 — protocol (@openbot/protocol)

**Date:** 2026-08-14  
**What for:** Record OpenBot M0 completion: npm rename, strip remote-only schemas, Agent*/agentId wire, new local-team messages, TDD red→green.  
**Branch:** `openbot/m0-protocol`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m0`  
**Plan:** `planning/boxbot-local-plan.md` §5 + §8 M0  

## Done criteria

- Root package name `openbot`; package `@openbot/protocol`
- CI: `pnpm --filter @openbot/protocol test --coverage`; no `@botbox/bot-image` step
- Remote-only schemas deleted; Agent* messages present
- `AgentConfig` requires `model` + `memoryBankId`; rejects `roleMd` and `plan`
- `harness.completeLogin` kept
- Tests green + coverage ≥80% lines

## Docs checked

- Context7 `/colinhacks/zod` (Zod 4 `.strict()`, `discriminatedUnion`, `safeParse`, `nullable`) — npm **zod@4.4.3**
- Leftover pins: `saved-results/boxbot-leftover-calls-2026-08-14.md` (strip `roleMd`; usage always `.strict()`; keep `harness.completeLogin`)

## TDD proof

### Red (against Bot* scaffold after npm rename)

```
pnpm --filter @openbot/protocol test
# Test Files 1 failed; Tests 53 failed | 3 passed (56)
# Failures: missing Agent* exports; botId still required on harness.completeLogin
```

Evidence pointer: `/tmp/m0-red.txt`

### Green

```
pnpm --filter @openbot/protocol test
# Test Files 1 passed; Tests 56 passed (56)

pnpm --filter @openbot/protocol test --coverage
# Coverage v8: All files Lines 100% (threshold 80)

pnpm --filter @openbot/protocol exec tsc --noEmit
# exit 0
```

Evidence pointers: `/tmp/m0-green2.txt`, `/tmp/m0-coverage.txt`

## Implementation notes

1. `BrowserExecResponseSchema` uses `z.union` (not `discriminatedUnion('ok')`) because Zod 4 rejects duplicate discriminator value `false` across error arms.
2. CI coverage command has no `--` after `test` (Vitest would treat `--coverage` as a file filter).
3. Daemon filter omitted until `@openbot/daemon` exists.

## How to reuse

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m0
pnpm install
pnpm --filter @openbot/protocol test
pnpm --filter @openbot/protocol test --coverage
pnpm --filter @openbot/protocol exec tsc --noEmit
```
