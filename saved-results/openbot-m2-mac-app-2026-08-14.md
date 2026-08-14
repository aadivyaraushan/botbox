# OpenBot M2 Mac app

**Date:** 2026-08-14  
**For:** M2 Electron Mac app delivery (team + thread + composer + tray + login-ax fake)  
**Branch:** `openbot/m2-mac-app`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m2`

## Result

M2 shipped: `@openbot/app` Electron shell with empty Team, New agent, reasoning/tool rows via fake-daemon, composer Send/Stop/Resume, harness switcher (B&W logos), model picker + context donut + spend on composer, slash menu, right-pane Coming-later shell, tray unread, openbot-axclick source + fake login-ax tests.

## Verification

```bash
pnpm --filter @openbot/app test
pnpm --filter @openbot/app build
pnpm --filter @openbot/app exec playwright test --project=ci
pnpm --filter @openbot/app exec playwright test --project=local-ax
pnpm --filter @openbot/app typecheck
node packages/app/e2e/real-window-drive.mjs
```

All green locally (2026-08-14). Real-window screenshot: `saved-results/openbot-m2-real-window-2026-08-14.png`.

## Notes

- No `Chrome.tsx` (M5). No M2b packaging.
- CI: Ubuntu runs app Vitest; `app-e2e` on macos-14 runs `--project=ci` (ignores login-ax).
- Preload builds as `index.cjs` because package `"type": "module"` would break CJS `require` in `.js` preload.

**PR:** https://github.com/aadivyaraushan/botbox/pull/5

## CI fix

Forced electron/install.js in app-e2e after pnpm install; PR checks green.
