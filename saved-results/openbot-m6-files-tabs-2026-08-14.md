# M6 Files tabs — report

- **Date:** 2026-08-14
- **Status:** done
- **Branch:** `openbot/m6-files-tabs`
- **Head SHA:** `6c8981e1a5e601e89774fb9781847dda09e64588`
- **PR:** https://github.com/aadivyaraushan/botbox/pull/11
- **Worktree:** `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m6`
- **Verdict:** live-ui-verified

## What shipped

- Daemon `packages/daemon/src/team/files.ts`: `listAgentFiles` / `readAgentFile` wired as `agent.files` / `agent.readFile`
- List order: `role.md`, `MEMORY.md`, then `workspace/**` (`localeCompare`); skips `node_modules`, `.git`, `browser-history.jsonl`; no `browser-profile/`
- `agent.readFile` of `../../bea/MEMORY.md` → `forbidden` (harness cross-agent read is separate; RPC stays scoped)
- App `FilesPane.tsx`: list + read-only preview + search; Files enabled in `+`; multiple Files tabs; Cmd+P focuses search
- `createAgent` no longer assumes `runtime` on create response (real daemon returns `{ok, agent}` only) — refresh via `agent.list`

## Commands run

```
pnpm --filter @openbot/daemon test          # 22 files / 82 tests green (files.test.ts 2)
pnpm --filter @openbot/app exec playwright test --project=ci   # 12 passed
pnpm typecheck                              # protocol + daemon + app green
```

Real-surface (not CI): spawned real `Daemon` (`skipHindsightSpawn: true`) on `127.0.0.1:18844`, launched Electron with `OPENBOT_DAEMON_WS` pointing at it (no fake-daemon). Drove New agent → Files → `role.md`/`MEMORY.md` list → preview → Cmd+P focus → second Files tab. Result: `{"ok":true,"saveCount":0,"focused":true,"tabs":2,"browserProfile":0}`.

## Deviations

- Playwright CI ignores `files-real-surface.spec.ts` (same pattern as `login-ax`); real-surface done as a one-shot Electron drive against a live daemon, recorded above
- `app.spec.ts` / `browser.spec.ts` now expect Files **enabled** (M5 left it disabled)
- Small App create-path fix for real-daemon response shape (protocol already `{ok, agent}` only)

## Principles applied

- **Laziness Protocol:** minimal FilesPane + list/read helpers; no new abstraction layers
- **Model the Domain:** ordered path list + read result union (`ok` / `not-found` / `forbidden`)
- **Prove It Works:** unit + Playwright fake + real-daemon window drive
