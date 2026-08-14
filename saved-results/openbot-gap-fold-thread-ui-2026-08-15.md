# OpenBot gap-fold-thread-ui

**Date:** 2026-08-15  
**For:** Shared harness event fold + plan-locked thread/composer/browser chrome.  
**Sources:** `planning/boxbot-local-plan.md` §2.2, §3.5; brief `gap-fold-thread-ui.md`.

## Result
App stream fold uses `@openbot/daemon/turns` `applyEvent` (via `packages/app/src/renderer/thread/fold/fold-turn.ts`). Thread chrome ships reasoning collapse, tool expand/`outputSummary`, Stopped./error rows, Jump to latest, Ctrl+L, history/Google address bar, quit/Pause-all wait modal, Setting up memory…

## Reproduce
```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-gap-ui
pnpm --filter @openbot/app test
pnpm --filter @openbot/app typecheck
pnpm --filter @openbot/app build
cd packages/app && CI=1 pnpm exec playwright test --project=ci e2e/gap-fold-thread-ui.spec.ts
```

## Commit / PR
- Commit `3cbec96606811138b6f5af2117a4b8ce4033686d` on `openbot/gap-fold-thread-ui`
- PR https://github.com/aadivyaraushan/botbox/pull/14
- Merged main `65729f6` before landing the feature commit
