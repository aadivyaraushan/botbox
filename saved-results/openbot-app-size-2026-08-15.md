# OpenBot composed packaged app size

Date: 2026-08-15

What: one OpenBot.app with real Hindsight (~2GB class) and live packaged daemon. No size cap.

App: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p2-compose/packages/app/dist/mac-arm64/OpenBot.app`

| Artifact | Size |
|---|---|
| OpenBot.app | **2.8G** (3010981888 bytes via `du -sk`) |
| Contents/Resources/hindsight | **2.5G** (2697134080 bytes) |
| Contents/Resources/daemon/main.mjs | present |

Evidence:
- `resources/hindsight` is real bake (not 4KB stub); composed drive fails closed under 100MB
- Packaged `Contents/Resources/hindsight/bin/hindsight-api` + `python` + `hf-cache`
- Packaged `Contents/Resources/daemon/main.mjs`; app spawn without `OPENBOT_DAEMON_WS`
- `agent.list` ok

Open (not claimed closed): Allow-click login still needs human Screen Recording re-grant after each ad-hoc rebuild (M2b).

Reproduce:
```
DEST=resources/hindsight ./scripts/dev/bundle-hindsight.sh
node packages/app/scripts/composed-packaged-drive.mjs
bash scripts/dev/verify-packaged-app.sh packages/app/dist/mac-arm64/OpenBot.app
```
