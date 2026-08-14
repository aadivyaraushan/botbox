# OpenBot p2 E2E stability (2026-08-15)

## What this is
Evidence that Playwright `--project=ci` stays green after fixing the agent-list race (`agent.list` before WS open → Ada never appears).

## Worktree
`/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p2-e2e` on `openbot/p2-e2e` (merged `origin/main` @ `015fc52`, includes creds #15 `0f50231`).

## Root cause
Main `daemonRequest` returned `{ ok:false, error:'not-connected' }` when the WebSocket was still connecting. Renderer `refreshList` did a one-shot `agent.list` and no-oped on failure, so seeded agents (Ada) never appeared. No retry on connect.

## Fix
1. Main: `waitForWsOpen` before sending RPC.
2. Renderer: `refreshAgentsList` retries `agent.list` on `not-connected`/`timeout`; refresh again when status flips to connected; upsert create response into local state.
3. E2E: unique `--user-data-dir`, shared `waitForAgentName` helper; fake-daemon busy `chat.send` queues + debug last-requests; split `app.spec.ts` assertions.

## Command
```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p2-e2e
pnpm --filter @openbot/app build
cd packages/app
for i in 1 2 3 4 5 6 7 8 9 10; do
  echo "=== RUN $i ==="
  CI=1 npx playwright test --project=ci || exit 1
done
```

## Result
| Run | Result | Notes |
|-----|--------|-------|
| 1 | PASS | 27 passed |
| 2 | PASS | 27 passed |
| 3 | PASS | 27 passed |
| 4 | PASS | 27 passed |
| 5 | PASS | 27 passed |
| 6 | PASS | 27 passed |
| 7 | PASS | 27 passed |
| 8 | PASS | 27 passed (~51.7s) |
| 9 | PASS | 27 passed (~52.5s) |
| 10 | PASS | 27 passed (~42.1s) |

**10/10 green.** Log: `/tmp/p2-e2e-10runs.txt`.

## Unit tests
`pnpm --filter @openbot/app test` → 48 passed (includes `daemon-ws-ready`, `daemon-list-sync`, fold queued text).
