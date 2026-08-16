# OpenBot ad-hoc signed composed build — live-driven

**Date:** 2026-08-16  
**For:** Pass-5 judge gap — one OpenBot.app that is both ad-hoc signed (`com.openbot.app` + entitlements) and live-driven (`agent.list`)  
**Branch / worktree:** `openbot/p5-signed` @ `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-signed`  
**App path (same artifact for codesign + drive):**  
`packages/app/dist/mac-arm64/OpenBot.app`

## Verdict

**PASS for engineering gate.** Dist used `identity: "-"`; `codesign` showed `Identifier=com.openbot.app`, `Signature=adhoc`, embedded entitlements; composed drive got daemon listening and `agent.list` ok on that same app.

**Not closed:** Allow-click / Accessibility + Screen Recording re-grant after ad-hoc rebuild (human). Claude smoke / M7 stay gated.

## Build

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-signed
# resources/hindsight → real bake (wt-p3-signing); electron-builder.yml identity: "-"
pnpm --filter @openbot/app dist   # DIST_EXIT=0
```

Log: `/tmp/openbot-p5-signed-dist.log` (`DIST_EXIT=0`, `identityName=-`).

## Codesign (same app)

```text
Identifier=com.openbot.app
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=752 flags=0x10002(adhoc,runtime)
Signature=adhoc
TeamIdentifier=not set
```

Entitlements (`codesign -d --entitlements :-`):

- `com.apple.security.automation.apple-events`
- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.cs.disable-library-validation`

`verify-packaged-app.sh` also reported: bundle id `com.openbot.app`, embedded entitlements present, no App Sandbox, hindsight ~2.6GB, daemon `main.mjs` present, size **3.1G**.

## Live drive (same app)

```bash
OPENBOT_PACKAGED_APP=packages/app/dist/mac-arm64/OpenBot.app \
  node packages/app/scripts/composed-packaged-drive.mjs
# DRIVE_EXIT=0
```

Observed:

```text
[daemon] [daemon] listening 127.0.0.1:19088
[composed-drive] PASS agent.list ok agents= 0
[verify-packaged-app] ok: codesign Identifier=com.openbot.app
[verify-packaged-app] ok: embedded entitlements present
```

Full log: `/tmp/openbot-p5-signed-drive.log`.

## Script fix included

`composed-packaged-drive.mjs` `duBytes` now `realpathSync` before `du -sk` so a symlink bake is not reported as 0 bytes on macOS (false stub fail). Callers: this script only; no API/schema change.

## Still open (human)

- Allow-click E2E after re-grant Accessibility + Screen Recording  
- Claude Max/Pro smoke  
- M7 stranger test  

Do not treat those as closed by this file.
