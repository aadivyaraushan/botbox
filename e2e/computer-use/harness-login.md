# Harness login — computer-use runbook

**Date:** 2026-08-13
**What for:** Whenever a OpenBot bot needs Claude Code or Codex account login, complete it on this Mac's already-signed-in Google Chrome. Do not use the bot's empty Chrome. Do not copy credential files off the Mac unless the user asks.

Canonical product steps: `planning/boxbot-local-plan.md` §3.5 login / Allow-click (historical remote plan `planning/botbox-plan.md` is superseded — do not follow it).

## Inputs

- A bot showing the `needs-login` banner (or `chat.send` returned `needs-login`), **or** a pre-app trigger: `node scripts/dev/login.mjs <botId> <harness>` with `OPENBOT_WS` set (M2/M3, before the Tauri app exists).
- This Mac's Google Chrome already signed into the Claude account and the ChatGPT / Codex account (default profile unless the user has said otherwise).

## Outputs

- `BotRuntime.harnessAuth` for **that** harness is `logged-in`.
- Banner gone (or `login-finished` `{ok:true}` on the pre-app path).
- `chat.send` is accepted (not `needs-login`).

## Preflight (do this first, every time)

**Fail closed before any login click.** Run:

```
node scripts/dev/login-screen-preflight.mjs
```

That script must exit `0`. It checks, in order:

1. Accessibility: System Events can list processes (needed for AX / `openbot-axclick`).
2. Google Chrome has an on-screen window.
3. **Screen Recording captures that Chrome window** via `screencapture -l <CGWindowID>` → `/tmp/openbot-login-preflight-window.png`. Display-only capture that shows wallpaper while Chrome exists is a **fail** (exit `2`), not a reason to hand the human the OpenAI page.
4. Auth URL open shape is `open -a "Google Chrome" -- <url>` (enforced by `login.mjs` when it opens the challenge).

| Exit | Meaning | Only sanctioned human ask |
|------|---------|---------------------------|
| `2` | Screen Recording miss | System Settings → Privacy & Security → **Screen Recording** → enable **Cursor** (`com.todesktop.230313mzl4w4u92`) |
| `3` | Accessibility miss | System Settings → Privacy & Security → **Accessibility** → enable **Cursor** |
| `4` | No Chrome window | Open Chrome, then retry (not a human OpenAI click) |
| `5` | Wrong open command | Agent bug; fix to `open -a "Google Chrome" -- <url>` |

`scripts/dev/login.mjs` runs the same preflight before `harness.startLogin` on macOS.

**Forbidden escalation:** do **not** tell the human to finish login / click Allow in Chrome when preflight fails or when `/tmp/openbot-login.png` is wallpaper-only.

Optional unlabeled-click fallback: if `which cliclick` is empty, `brew install cliclick`. Prefer `openbot-axclick` (product path).

## Algorithm

1. **Start login**
   - App path (M4+): click **Log in** on the `needs-login` banner. That sends `harness.startLogin` with `botId` and `harness` **from the banner** (not "the active harness"). Do not click Take over.
   - Pre-app path (M2/M3): `OPENBOT_WS='ws://<host>:7777/?token=<admin-token>' node scripts/dev/login.mjs <botId> <claude-code|codex>`. That script sends `harness.startLogin`, prints the challenge, and runs `open -a "Google Chrome" -- "$URL"`.
2. Wait for `login-challenge` (URL, optional `userCode`, `needsPasteCode`).
3. Confirm Google Chrome opened **that** URL. Search **all** windows and tabs, not the front tab only:

   ```
   osascript <<'APPLESCRIPT'
   tell application "Google Chrome"
     set needle to "PASTE_CHALLENGE_URL_HERE"
     repeat with w in windows
       set i to 0
       repeat with t in tabs of w
         set i to i + 1
         if (URL of t) starts with needle or needle starts with (URL of t) then
           set active tab index of w to i
           set index of w to 1
           activate
           return URL of t
         end if
       end repeat
     end repeat
     error "no Chrome tab matches challenge URL"
   end tell
   APPLESCRIPT
   ```

   If no tab matches, run `open -a "Google Chrome" -- "$URL"` and search again. Do **not** open Cursor's browser. Do **not** launch Playwright. Do **not** restart Chrome with `--remote-debugging-port`. Do **not** open Safari or the default browser.
4. Screenshot the **main display** (not every display): `screencapture -D 1 -t png /tmp/openbot-login.png`. Read that image. Confirm the visible page is the vendor approve page (Allow / Continue / Authorize), not a "sign in with password" form.
5. **Primary click is screenshot coordinates, converted to points.** `screencapture` writes pixels; `cliclick` moves in points. On a Retina Mac those differ (verified 2026-08-13: 3024×1964 pixels vs 1512×982 points = 2×). Compute scale once:

   ```
   PIX_W=$(sips -g pixelWidth /tmp/openbot-login.png | awk '/pixelWidth/ {print $2}')
   PT_W=$(osascript -e 'tell application "Finder" to get item 3 of (get bounds of window of desktop)')
   SCALE=$(python3 -c "print($PIX_W / float($PT_W))")
   ```

   Read the image, note the Allow/Continue/Authorize control's pixel (x, y), then:

   ```
   cliclick c:$(python3 -c "print(int($X / $SCALE))"),$(python3 -c "print(int($Y / $SCALE))")
   ```

   Screenshot again and Read `/tmp/openbot-login.png` to confirm the page advanced. Do not type a password.

   Optional fast path (not required): deep-search the accessibility tree (`entire contents of window 1` / `AXWebArea`), not `button … of window 1` (that only sees Chrome chrome, not the page). If it fails, use the coordinate path above.
6. If the page asks to sign in from scratch (email/password), **fail closed**: stop and report. The signed-in session was not used. Do not create a new account. Do not Take over into the bot Chrome.
7. **Code entry** (same treatment as the click — named commands, not prose).

   **Codex** (`userCode` present, page asks for the one-time code): focus Chrome, type the code, press return:

   ```
   osascript <<'APPLESCRIPT'
   tell application "System Events"
     tell process "Google Chrome"
       set frontmost to true
       click text field 1 of window 1
       delay 0.2
       keystroke "PASTE_USER_CODE_HERE"
       delay 0.3
       keystroke return
     end tell
   end tell
   APPLESCRIPT
   ```

   Then `screencapture -t png /tmp/openbot-login.png` and Read it. If the typed code is not visible and the page still asks for it, retry the keystroke once. If still missing, stop and report (do not Take over).

   **Claude** (`needsPasteCode` true): Read `/tmp/openbot-login.png` for the vendor code shown on the page.
   - App path: click the OpenBot paste field (the field next to the needs-login banner), then:

     ```
     osascript -e 'tell application "System Events" to keystroke "PASTE_VENDOR_CODE_HERE"'
     ```

     Click the submit control on that field (sends `harness.completeLogin`). Screenshot the app; the paste field should be empty or the banner should be waiting.
   - Pre-app path: write the code to `/tmp/openbot-login-code.txt` (the file `scripts/dev/login.mjs` polls via `--code-file`). Do **not** try to type into the script's stdin.

   If Codex only shows Allow and no code field, skip typing; the CLI polls until `auth.json` has tokens.
8. Wait until the banner clears / `login-finished` `{ok:true}`, or 15 minutes, whichever first. Then send a chat message (or skip chat on the pre-app path); it must not return `needs-login`. If `login-finished` `{ok:false}`, the banner copy must change to `Sign-in did not finish (<error>). Try Log in again.` — that is not the same as never having clicked Log in. Retry Log in once; if it fails again, stop and report.

## Forbidden

- Copying `~/.claude/.credentials.json`, `~/.codex/auth.json`, or `~/Library/Application Support/Google/Chrome`.
- Logging in through the bot desktop Chrome (fresh profile, not signed in).
- Asking the user to Take over and type CLI commands when this runbook can run.
- Opening the auth URL in Safari, Cursor's browser, a Playwright profile, or any browser other than the already-running Google Chrome.
- Falling back to `openUrl(url)` with no app name (that opens the default browser).

## Take over fallback (only if Log in itself failed)

In the bot's xfce4-terminal, the same CLIs, but **unset DISPLAY** so the bot Chrome does not open:

```
env -u DISPLAY BROWSER=/opt/openbot/print-login-url claude auth login
env -u DISPLAY codex login --device-auth
```

Read the printed URL (or `/bot/state/login-url`) and continue from Algorithm step 3 on the Mac.
