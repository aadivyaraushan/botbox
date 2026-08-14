# OpenBot gap-packaged-daemon

Date: 2026-08-15

What: packaged app spawns live daemon; WS agent.list succeeds without OPENBOT_DAEMON_WS.

App: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-gap-packaged/packages/app/dist/mac-arm64/OpenBot.app`

Evidence:
- Resources/daemon/main.mjs present
- Spawn via ELECTRON_RUN_AS_NODE + process.execPath
- agent.list ok

Reproduce:
```
node packages/app/scripts/packaged-daemon-drive.mjs
```

## Packaged spawn log (excerpt)

```
[app] spawn-daemon {
  isPackaged: true,
  command: '.../OpenBot.app/Contents/MacOS/OpenBot',
  args: [
    '.../OpenBot.app/Contents/Resources/daemon/main.mjs'
  ]
}
[daemon] listening 127.0.0.1:19087
[packaged-drive] PASS agent.list ok agents= 0
```

Commands:
```
pnpm --filter @openbot/app test
node scripts/dev/bundle-daemon.mjs
node packages/app/scripts/packaged-daemon-drive.mjs
bash scripts/dev/verify-packaged-app.sh packages/app/dist/mac-arm64/OpenBot.app
```
