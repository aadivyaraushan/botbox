# OpenBot M2b packaged app size

**Date:** 2026-08-14  
**For:** M2b packaging milestone (ad-hoc / `mac.identity: null`, `appId` `com.openbot.app`)  
**Branch / worktree:** `openbot/m2b-packaging` @ `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m2b`

## Result

| Artifact | Size |
|---|---|
| `packages/app/dist/mac-arm64/OpenBot.app` | **3.1G** (3,285,803,008 bytes via `du -sk`) |
| `packages/app/dist/OpenBot-0.0.0-arm64.dmg` | 944M |
| `packages/app/dist/OpenBot-0.0.0-arm64-mac.zip` | 963M |

No size cap. Full Hindsight kept (Python 3.11.15 + `hindsight-all==0.9.0` + baked weights).

## Layout checks (`scripts/dev/verify-packaged-app.sh`)

- Bundle id: `com.openbot.app`
- `Contents/Helpers/openbot-axclick` present and executable
- `Contents/Resources/hindsight/bin/hindsight-api` present
- `hindsight/python` + `hindsight/hf-cache` present
- No App Sandbox entitlement

## Build

```sh
# §5.5.8 (already run for this measurement)
DEST=resources/hindsight ./scripts/dev/bundle-hindsight.sh

# §8 M2b
pnpm --filter @openbot/app test
pnpm --filter @openbot/app dist   # build + electron-builder (script name: package)
./scripts/dev/verify-packaged-app.sh
```

- electron-builder `26.15.7`
- `mac.identity: null` → skipped code signing (plan lock; Developer-ID is follow-on)
- afterPack copied `helpers/openbot-axclick` → `Contents/Helpers/openbot-axclick`

## Pin

See `packages/daemon/src/memory/hindsight-pin.json` (`treeSha256` of packaging `resources/hindsight`).

## Re-grant note

After **each** ad-hoc rebuild, re-grant Accessibility and Screen Recording before Allow-click E2E / M7 (do not chase a stable ad-hoc identity).
