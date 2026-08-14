#!/bin/sh
# Verify M2b packaged OpenBot.app layout (Helpers + hindsight extraResources).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="${1:-$ROOT/packages/app/dist/mac-arm64/OpenBot.app}"
if [ ! -d "$APP" ]; then
  # electron-builder may emit mac/ on some versions
  ALT="$ROOT/packages/app/dist/mac/OpenBot.app"
  if [ -d "$ALT" ]; then
    APP="$ALT"
  fi
fi

fail() { echo "[verify-packaged-app] FAIL: $*" >&2; exit 1; }
ok() { echo "[verify-packaged-app] ok: $*"; }

[ -d "$APP" ] || fail "missing app at $APP (pass path as \$1)"
ok "app=$APP"

PLIST="$APP/Contents/Info.plist"
[ -f "$PLIST" ] || fail "missing Info.plist"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" | grep -qx 'com.openbot.app' \
  || fail "CFBundleIdentifier is not com.openbot.app"
ok "bundle id com.openbot.app"

HELPER="$APP/Contents/Helpers/openbot-axclick"
[ -x "$HELPER" ] || fail "missing executable Helpers/openbot-axclick"
ok "Helpers/openbot-axclick"

HAPI="$APP/Contents/Resources/hindsight/bin/hindsight-api"
[ -x "$HAPI" ] || fail "missing Resources/hindsight/bin/hindsight-api"
ok "hindsight/bin/hindsight-api"

[ -d "$APP/Contents/Resources/hindsight/python" ] || fail "missing hindsight/python"
[ -d "$APP/Contents/Resources/hindsight/hf-cache" ] || fail "missing hindsight/hf-cache"
ok "hindsight python + hf-cache"

# Refuse stub-class trees (~4KB). Real bake is ~2GB class (plan M2b / composed proof).
H_KB="$(du -sk "$APP/Contents/Resources/hindsight" | awk '{print $1}')"
# 100MB floor in KB
if [ "$H_KB" -lt 102400 ]; then
  fail "hindsight tree is ${H_KB}KB (stub class); need real ~2GB bake"
fi
ok "hindsight size=${H_KB}KB (not stub)"

DAEMON_ENTRY="$APP/Contents/Resources/daemon/main.mjs"
[ -f "$DAEMON_ENTRY" ] || fail "missing Resources/daemon/main.mjs"
ok "daemon/main.mjs"


# No App Sandbox entitlement expected in entitlements source; refuse sandbox string in signed entitlements if present
if codesign -d --entitlements :- "$APP" 2>/dev/null | grep -q 'app-sandbox'; then
  fail "App Sandbox entitlement present"
fi
ok "no App Sandbox"

SIZE_BYTES="$(du -sk "$APP" | awk '{print $1 * 1024}')"
SIZE_H="$(du -sh "$APP" | awk '{print $1}')"
ok "size=$SIZE_H (${SIZE_BYTES} bytes)"
echo "$SIZE_BYTES"
