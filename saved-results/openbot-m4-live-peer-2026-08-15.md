# OpenBot M4 live peer (Codex+Codex)

**Date:** 2026-08-15  
**For:** pass-4 p4-m4 — real Daemon, two live Codex agents, A messages B.  
**Branch:** `openbot/p4-m4`  
**Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-m4`

## Result

`ok: true`. Real Daemon (`start-real-daemon.mjs`, not `e2e/fake-daemon.ts`). Ada and Bea on Codex. Live Codex turn started on Ada. Peer send via Daemon MCP `message_agent` (Ada’s openbot token from her Codex `config.toml`). Electron UI showed **Messaged Bea** / **Message from Ada** + **Please help**, Bea unread while Ada selected, unread cleared on select.

`OPENBOT_SKIP_HINDSIGHT=1` for this unit (memory is p4-hindsight). Hindsight MCP/recall noise expected.

## Commands

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-m4
node --test packages/app/scripts/m4-live-peer-helpers.test.mjs
CODEX_HOME=/Users/aadivyar/.openbot/codex-home OPENBOT_PORT=18880 \
  node packages/app/scripts/m4-real-surface.mjs
```

Precondition: `CODEX_HOME=~/.openbot/codex-home codex login status` → `Logged in using ChatGPT`.

## Evidence (run5, port 18880)

```json
{
  "ok": true,
  "daemon": "real",
  "harnessPair": "codex+codex",
  "peerBody": "Please help",
  "adaId": "70e43b61-4625-4f48-9050-8a91680a6d65",
  "beaId": "fd2b2eb1-5cec-4e51-912e-acca3795f796",
  "port": 18880,
  "adaMarker": "Messaged BeaPlease help",
  "beaMarker": "Message from AdaPlease help",
  "peerSent": true,
  "peerReceived": true,
  "peerVia": "mcp-message_agent",
  "liveCodexTurn": true
}
```

Log: `/tmp/openbot-m4-live-peer-run5.log` (`real-surface ok`).

## How to reproduce

1. Confirm Codex login under `CODEX_HOME=~/.openbot/codex-home`.
2. From the worktree: `pnpm --filter @openbot/app build` if `packages/app/out` is missing.
3. Run the commands above; expect exit 0 and JSON `"ok": true` / `real-surface ok`.
