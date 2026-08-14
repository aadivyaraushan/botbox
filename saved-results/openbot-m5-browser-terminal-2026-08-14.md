# OpenBot M5 browser + terminal

**Date:** 2026-08-14  
**For:** Milestone M5 verification artifact (browser + terminal panes).  
**PR:** https://github.com/aadivyaraushan/botbox/pull/10  
**Branch:** `openbot/m5-browser-terminal`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m5`

## Result
M5 shipped: Browser (`WebContentsView` + `Chrome.tsx`) and Terminal (xterm + node-pty) right-pane tabs; daemon MCP browser/shell tools; Playwright + real-window verify.

## Tests
| Suite | Result |
| --- | --- |
| `@openbot/daemon` vitest | 80 passed |
| `@openbot/app` vitest | 19 passed |
| Playwright `--project=ci` | 11 passed |
| `e2e/real-window-drive.mjs` | real-surface ok |

Screenshot: `saved-results/openbot-m5-real-window-2026-08-14.png`

## How to reproduce
```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m5
pnpm --filter @openbot/daemon test
pnpm --filter @openbot/app test
pnpm --filter @openbot/app exec playwright test --project=ci
node packages/app/e2e/real-window-drive.mjs
```

## Context
Plan: `planning/boxbot-local-plan.md` §8 M5. No OSS browser-shell; no Review tab. Files tab deferred.

Gate facts (creation): importers = humans / orchestrate readers of `saved-results/`; no code API; no schema; user asked to finish M5 and save useful results.
