#!/bin/bash
# Fake openbot-axclick for CI / login-ax.spec.ts (no Accessibility).
set -euo pipefail
INPUT="${1:-}"
if [[ -z "$INPUT" ]]; then
  INPUT="$(cat)"
fi

case "${OPENBOT_FAKE_AXCLICK:-}" in
  accessibility-denied)
    echo '{"ok":false,"error":"accessibility-denied"}'
    exit 1
    ;;
  button-not-found)
    echo '{"ok":false,"error":"button-not-found"}'
    exit 1
    ;;
  chrome-not-found)
    echo '{"ok":false,"error":"chrome-not-found"}'
    exit 1
    ;;
  ok)
    echo '{"ok":true}'
    exit 0
    ;;
esac

if echo "$INPUT" | grep -q '"titles"'; then
  if echo "$INPUT" | grep -Eqi 'Allow|Continue|Authorize|Approve'; then
    if [[ "${OPENBOT_FAKE_AXCLICK_FORCE_NOT_FOUND:-}" == "1" ]]; then
      echo '{"ok":false,"error":"button-not-found"}'
      exit 1
    fi
  fi
fi

echo '{"ok":false,"error":"button-not-found"}'
exit 1
