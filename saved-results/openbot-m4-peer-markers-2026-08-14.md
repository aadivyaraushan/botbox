# OpenBot M4 peer markers

**Date:** 2026-08-14  
**What for:** Record of M4 peer-marker implementation (Messaged B / Message from B + unread).  
**Branch / commit:** `openbot/m4-peer-markers` @ `84d3212`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m4`  
**PR:** https://github.com/aadivyaraushan/botbox/pull/8

## Result
App-side peer markers are wired. Ada’s thread shows **Messaged Bea** (text preview truncated at 140). Bea’s thread shows **Message from Ada** plus the inbound body. While Ada is selected, Bea’s team row shows the unread dot until Bea is opened.

Daemon peer delivery (`message_agent` → `peer.send`) was already in M1.

## How to reuse
```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m4
pnpm --filter @openbot/app build
pnpm --filter @openbot/app test
pnpm --filter @openbot/app exec playwright test --project=ci e2e/peer.spec.ts
node packages/app/scripts/m4-real-surface.mjs
```

## Key files
- `packages/app/src/renderer/thread-peer/peer-marker.ts`
- `packages/app/src/renderer/thread/PartTimeline.tsx`
- `packages/app/src/renderer/App.tsx` (live `peer-message` + unread)
- `packages/app/e2e/peer.spec.ts`
- `packages/app/e2e/fake-daemon.ts` (`scenario=peer`)
- `packages/app/scripts/m4-real-surface.mjs`
