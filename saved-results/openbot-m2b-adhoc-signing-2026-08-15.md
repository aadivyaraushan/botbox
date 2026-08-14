# OpenBot M2b ad-hoc signing proof

**Date:** 2026-08-15  
**For:** p3-signing / M2b packaging — prove `mac.identity: "-"` actually ad-hoc signs as `com.openbot.app` with embedded entitlements  
**Branch / worktree:** `openbot/p3-signing` @ `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p3-signing`

## What was wrong

`mac.identity: null` made electron-builder **skip** signing. The packaged app kept the stock Electron **linker-signed** signature:

- `Identifier=Electron`
- `flags=adhoc,linker-signed`
- `Sealed Resources=none`
- **No** embedded entitlements

`Info.plist` still had `CFBundleIdentifier=com.openbot.app`, so a verify that only checked the plist gave false assurance.

electron-builder 26.x docs (https://www.electron.build/docs/mac): `identity: null` skips signing; `identity: "-"` is ad-hoc signing.

## Fix

1. Plan: `planning/boxbot-local-plan.md` §8 M2b — pin `identity: "-"`, document the prior discrepancy.
2. Config: `packages/app/electron-builder.yml` → `identity: "-"` (keep `hardenedRuntime` + entitlements; not MAS / not Developer-ID).
3. Tests: `packages/app/test/packaging.test.ts` asserts `identity: "-"` and rejects `identity: null`.
4. Verify: `scripts/dev/verify-packaged-app.sh` requires `codesign` Identifier=`com.openbot.app` and non-empty entitlements (`allow-jit`, `apple-events`).

## Before (prior compose package, `identity: null`)

App: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p2-compose/packages/app/dist/mac-arm64/OpenBot.app`

```
Identifier=Electron
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=513 flags=0x20002(adhoc,linker-signed) hashes=13+0 location=embedded
Signature=adhoc
Info.plist=not bound
TeamIdentifier=not set
Sealed Resources=none
Internal requirements=none
```

`codesign -d --entitlements :-` printed only the Executable line (empty entitlements).

Hardened verify against that app fails closed:

```
[verify-packaged-app] FAIL: codesign Identifier=Electron (want com.openbot.app; Electron=linker-signed skip)
```

## After (`identity: "-"`)

App: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p3-signing/packages/app/dist/mac-arm64/OpenBot.app`

Hindsight: real bake copied from p2-compose (`resources/hindsight` ~2.3G; packaged tree ~2.5GB class). Never stubbed.

### `codesign -dv --verbose=4`

```
Executable=.../OpenBot.app/Contents/MacOS/OpenBot
Identifier=com.openbot.app
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=752 flags=0x10002(adhoc,runtime) hashes=13+7 location=embedded
Signature=adhoc
Info.plist entries=33
TeamIdentifier=not set
Runtime Version=15.2.0
Sealed Resources version=2 rules=13 files=70314
Internal requirements count=0 size=12
```

### `codesign -d --entitlements :-`

```xml
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.automation.apple-events</key><true/><key>com.apple.security.cs.allow-jit</key><true/><key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/><key>com.apple.security.cs.disable-library-validation</key><true/></dict></plist>
```

### verify-packaged-app.sh

All checks ok, including `codesign Identifier=com.openbot.app`, embedded entitlements, no App Sandbox. Size ~3.1G.

## Commands to reproduce

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p3-signing
# real hindsight under resources/hindsight (gitignored); copy from compose bake if missing
pnpm --filter @openbot/app dist
bash scripts/dev/verify-packaged-app.sh packages/app/dist/mac-arm64/OpenBot.app
codesign -dv --verbose=4 packages/app/dist/mac-arm64/OpenBot.app
codesign -d --entitlements :- packages/app/dist/mac-arm64/OpenBot.app
```

## Open (not closed)

**Allow-click E2E is still open.** After each ad-hoc rebuild, Accessibility + Screen Recording must be re-granted by a human before M2b Allow-click / M7. This note does **not** claim Allow-click closed.

Developer-ID + notarize remain a follow-on after M2b.
