# OpenBot Codex live verify

**Date:** 2026-08-15  
**For:** gap-codex-surface — real Codex harness turn + ask + files against a live daemon.  
**Branch:** `openbot/gap-codex-surface`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-gap-codex`

## Result

`ok: true`. Agent created, switched to Codex (`agent.setHarness`), turn finished with `OPENBOT_CODEX_LIVE` in assistant text, `ask-user-question` seen via app-server `requestUserInput`, files listed `role.md` / `MEMORY.md`.

Claude Max/Pro stays deferred (`m1-smoke-max-pro`). Not skipped for that gate.

## Commands

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-gap-codex
CODEX_HOME=~/.openbot/codex-home OPENBOT_HOME=~/.openbot \
  node packages/daemon/scripts/codex-live-verify.mjs
```

Precondition: `CODEX_HOME=~/.openbot/codex-home codex login status` → `Logged in using ChatGPT`.

## Output (abbreviated)

```json
{
  "ok": true,
  "agentId": "cc20806c-8a48-4767-ae69-f8144df3c407",
  "slug": "codexlive76739",
  "harness": "codex",
  "turnFinished": true,
  "assistantSnippet": "OPENBOT_CODEX_LIVE.…",
  "askSeen": true,
  "askPartId": "call_QoFcKBovw8qF9ToNbUg80ja7",
  "askError": null,
  "files": ["role.md", "MEMORY.md"],
  "rolePreview": "# CodexLive76739\n\n\n",
  "home": "/Users/aadivyar/.openbot",
  "port": 18866,
  "auth": "/Users/aadivyar/.openbot/codex-home/auth.json"
}
```

Re-run after merging `origin/main` (packaged-daemon PR #12) on 2026-08-15; exit 0.

Notes from the same run: Hindsight MCP recall failed (skipHindsightSpawn daemon; expected noise). Codex logged MCP transport errors to `127.0.0.1:8888` while memory was down; turn + ask still completed.

## Related real-surface scripts

| Script | Purpose |
| --- | --- |
| `packages/app/scripts/m6-real-surface.mjs` | Real-daemon Files drive |
| `packages/app/scripts/m5-real-surface.mjs` | Real-daemon Browser + Terminal drive |
| `packages/app/e2e/real-window-drive.mjs` | Fake-daemon chrome smoke only (not harness verify) |
| `packages/daemon/scripts/codex-live-verify.mjs` | This Codex live check |

### M5 / M6 runs (this session)

```bash
node packages/app/scripts/m6-real-surface.mjs
# {"ok":true,"saveCount":0,"focused":true,"tabs":2,"browserProfile":0,…}

OPENBOT_PORT=18858 node packages/app/scripts/m5-real-surface.mjs
# {"ok":true,"checks":{"browserChrome":true,"browserEnabled":true,"terminalEnabled":true,
#  "urlNavigated":true,"drivingShown":true,"terminalPane":true,"drivingCleared":true},…}
```

## How to reproduce

1. Confirm Codex login: `CODEX_HOME=~/.openbot/codex-home codex login status`
2. From the worktree root, run the three commands above (m6, m5, codex-live-verify).
3. Expect exit 0 and JSON `"ok": true` on each.
