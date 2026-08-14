# OpenBot M5 agent-driven real surface

**Date:** 2026-08-15  
**For:** Pass-4 unit `p4-m5` — prove agent half live (needs-site→allow-site, stayHidden, shell→Terminal, terminal_read) against real daemon + Electron, Codex harness.  
**Branch:** `openbot/p4-m5`

## Result

Live run succeeded: `ok: true`, all agent-driven checks true. Human-side checks still true. No plan revise (fixture-only was not claimed).

```json
{
  "ok": true,
  "checks": {
    "browserChrome": true,
    "browserEnabled": true,
    "terminalEnabled": true,
    "urlNavigated": true,
    "drivingShown": true,
    "terminalPane": true,
    "drivingCleared": true,
    "needsSiteAllow": true,
    "stayHidden": true,
    "agentShellVisible": true,
    "terminalRead": true,
    "harnessCodex": true
  },
  "port": 18872,
  "daemon": "real",
  "harness": "codex",
  "agentId": "b8a561f6-5d5e-465c-a0de-8dbe32ea8a14",
  "navResult": {
    "ok": true,
    "result": { "url": "https://example.org/", "title": "Example Domain" }
  },
  "stayNav": {
    "ok": true,
    "result": { "url": "https://example.org/", "title": "Example Domain" }
  },
  "shellResult": { "exitCode": 0, "tabId": "ec82e3e3-41d8-4300-b86e-1d763980af04" },
  "focusedBefore": true,
  "focusedAfter": true
}
```

## What changed

- Extended `packages/app/scripts/m5-real-surface.mjs`: in-process real `Daemon`, Codex auth from `CODEX_HOME`, `agent.setHarness` → codex, MCP `browser_navigate` / `shell_run` / `terminal_read` against the live Electron app.
- Wired `browser:meta` → renderer URL bar (`preload` + `App.tsx`) so agent navigates update the chrome.

## How to reproduce

```bash
cd /path/to/grok-bot-clone-wt-p4-m5
pnpm --filter @openbot/app build
CODEX_HOME=~/.openbot/codex-home OPENBOT_PORT=18872 pnpm exec tsx packages/app/scripts/m5-real-surface.mjs
```

Requires `~/.openbot/codex-home/auth.json` (copied into the temp `OPENBOT_HOME/codex-home` for the run).

## Context

Judge G5 / pass-2: human-side was already live; agent-side was unit/fixture only. This run closes that gap without calling fixture-only “real surface.”
