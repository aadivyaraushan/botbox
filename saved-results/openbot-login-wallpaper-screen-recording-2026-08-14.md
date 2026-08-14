# OpenBot M1b Codex login Allow-click miss (wallpaper capture)

**Date:** 2026-08-14  
**What for:** Root-cause the earlier M1b failure where agents saw Chrome on the OpenAI/Codex auth URL but `screencapture` showed only wallpaper, then wrongly asked the human to finish login in Chrome. Encode a fail-closed guard so that class of failure cannot be mistaken for a human OpenAI click again.

## Verdict (short)

**Root cause:** Cursor (`com.todesktop.230313mzl4w4u92`) lacked **Screen Recording** (`kTCCServiceScreenCapture` auth_value=`0`). Display capture returned menu bar + wallpaper with windows stripped. Window capture failed with `could not create image from window`. Accessibility for Cursor was granted (`auth_value=2`), so Chrome URL/bounds via AppleScript worked and AX click was possible once used. Wrong escalation treated wallpaper as “human must finish login in Chrome.”

**Sibling bugs (separate classes):**
1. `move_agent_to_root` disconnect + `git checkout main` failing when main is already checked out in the primary repo → Cursor MCP / worktree tooling, not Screen Recording.
2. Orchestrate yielding to parent while children still in flight → coordinator policy miss, not Screen Recording.

## Evidence

| Check | Result |
|-------|--------|
| Chrome window (CGWindowList) | Present: id≈26537, bounds X=90 Y=90 W=1210 H=830 |
| `screencapture -l <id>` | exit 1, stderr `could not create image from window`, no PNG |
| `screencapture -D 1` | PNG 3024×1964 wallpaper-only (e.g. `/tmp/openbot-login-diag-preflight.png`, `/tmp/openbot-login-display-probe.png`); menu bar can show Discord/Chrome while windows are missing from the bitmap |
| TCC Screen Recording | `com.todesktop.230313mzl4w4u92` auth_value=0 for `kTCCServiceScreenCapture` (denied) |
| TCC Accessibility | `com.todesktop.230313mzl4w4u92\|2` (allowed) |
| Terminal Screen Recording | `com.apple.Terminal\|2` (allowed) — explains why Terminal-run capture can work while Cursor-run capture fails |
| Codex auth (retry) | `CODEX_HOME=~/.openbot/codex-home codex login status` → `Logged in using ChatGPT`; `~/.openbot/codex-home/auth.json` present |
| Transcript wrong ask | Parent orch returned “Human-only blocker… finish the OpenAI Codex login already open” when wallpaper blocked coordinate click |

### Inputs → expected → bad step

1. **Inputs:** Chrome tab on OpenAI/Codex auth; agent on Cursor; runbook `e2e/computer-use/harness-login.md` step 4 screenshot + coordinate/AX click.
2. **Expected output:** PNG containing Chrome Allow/Continue UI; click succeeds; `auth.json` written.
3. **Bad step:** `screencapture` under Cursor without Screen Recording → wallpaper bitmap (or `-l` hard fail). Agents then escalated the OpenAI form instead of Screen Recording for Cursor.

## Guard added (structure, not prose)

| Artifact | Role |
|----------|------|
| `scripts/dev/login-screen-preflight.mjs` | Fail-closed CLI + classifier: Accessibility, Chrome window id, `screencapture -l` must produce a real window PNG; wrong `open` argv rejected |
| `scripts/dev/login.mjs` | Runs preflight on macOS **before** `harness.startLogin` |
| `scripts/dev/login-screen-preflight.test.mjs` | Unit tests for classifier / failure copy |
| `e2e/computer-use/harness-login.md` | Preflight requires the CLI; exit `2`/`3` map only to System Settings toggles |
| `planning/boxbot-local-plan.md` §3.5 item 7 | One-line pin: wallpaper-only = Screen Recording denied; never “human finish login in Chrome” |
| `package.json` script `test:login-preflight` | `node --test scripts/dev/login-screen-preflight.test.mjs` |

Live probe after guard (2026-08-14):

```
node scripts/dev/login-screen-preflight.mjs
# exit 2
# FAIL: Screen Recording cannot capture a real Chrome window.
# Grant … Screen Recording → enable Cursor (com.todesktop.230313mzl4w4u92).
```

## How to reuse

```bash
node scripts/dev/login-screen-preflight.mjs   # must exit 0 before any Allow click
pnpm test:login-preflight
CODEX_HOME=~/.openbot/codex-home codex login status
```

If exit `2`: System Settings → Privacy & Security → **Screen Recording** → enable **Cursor**.  
If exit `3`: same pane → **Accessibility** → enable **Cursor**.  
Never ask the human to click Allow in Chrome for this failure mode.

## Reproduce the miss (still true until Screen Recording granted)

```bash
# Chrome must have a window
swift /tmp/openbot-chrome-window-id.swift   # or probe inside login-screen-preflight.mjs
screencapture -l <CGWindowID> /tmp/w.png   # → could not create image from window
screencapture -D 1 /tmp/d.png              # → wallpaper-only while Chrome exists
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "SELECT client,auth_value FROM access WHERE service='kTCCServiceScreenCapture' AND client LIKE '%todesktop%';"
```
