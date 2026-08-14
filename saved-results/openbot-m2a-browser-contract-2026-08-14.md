# OpenBot M2a — Thin browser chrome contract

**Date:** 2026-08-14  
**For:** Lock the browser chrome contract before M5 implements views.  
**Sources:** `planning/boxbot-local-plan.md` §2.4, §3.5 Browser, §5.2 preload IPC, §6 Look, §8 M2a; `saved-results/boxbot-leftover-calls-2026-08-14.md` §3.

## Verdict

M2a is **contract-only**. No `Chrome.tsx`. No OSS browser-shell package. M5 builds the React chrome over Electron `WebContentsView`.

## Chrome controls (M5 implements)

| Control | Role |
|---|---|
| URL bar | Human navigates; address suggestions via preload `history.suggest` (main reads `browser-history.jsonl`; renderer never reads disk) |
| Back | Preload `browser.back { tabId }` |
| Forward | Preload `browser.forward { tabId }` |
| Reload | Preload `browser.reload { tabId }` |
| You’re driving | Visible only on the **browser pane** while `humanControl.held === true` |
| Return control | Only `{ held:false }` path; unblocks agent browser tools |

Human URL-bar navigations and back/forward also append `{ ts, url, title }` to that agent’s `browser-history.jsonl`.

## Drive vs take over

- Agent drives the frontmost browser tab (watch mode).
- Click inside the page takes control (`before-mouse-event` mouseDown → `browser.setHumanControl { held:true }`).
- Pane chrome shows **You’re driving** + **Return control** only here.
- No thread marker, team-row takeover state, or takeover banner.
- Agent ops use `executeJavaScript` / `loadURL` / `capturePage` (not `sendInputEvent`), so they do not fire take-control.
- While held, agent browser tools return `human-control-held`.

## Engine

- Electron **`WebContentsView`** (not deprecated `BrowserView`; not CEF).
- One view per browser tab; cookies in `~/.openbot/private/<slug>/browser-profile` via `session.fromPath`.
- Frontmost tab of the selected agent gets pane bounds; others sit off-window at real size (`{ x: -2000, y: 0, width: 1280, height: 800 }`).
- Future path (M5 only): `packages/app/src/renderer/browser/Chrome.tsx`.

## Preload IPC names (pinned — plan §5.2)

```
browser.navigate { tabId, url }
browser.back { tabId }
browser.forward { tabId }
browser.reload { tabId }
browser.setBounds { agentId, tabId, rect }
```

Related daemon messages (take-control wiring, not preload chrome IPC):

- `browser.setHumanControl { type:'browser.setHumanControl', agentId, held: boolean }`
- Daemon↔app browser ops still go through `browser.exec` (MCP tools land in M5).

Main↔renderer daemon IPC remains `daemon.request` / `daemon.onEvent`.

## Theme tokens (ChatGPT desktop / Codex look — plan §6)

Copy `:root` from `saved-results/botbox-ui-concept-2026-08-13.html` into `packages/app/src/renderer/ui/tokens.css` (M2/M5). Do not invent a second palette.

```
--bg: #0c0c0c;
--bg-2: #141414;
--bg-3: #1c1c1c;
--line: #2a2a2a;
--ink: #ececec;
--muted: #8d8d8d;
--accent: #c4f542;
--accent-ink: #111;
--danger: #e24b3a;
--warn: #e6b84c;
--radius: 6px;
--font: "IBM Plex Sans", "Segoe UI", sans-serif;
--mono: "IBM Plex Mono", ui-monospace, monospace;
```

Body stage background `#1a1a1a`. Bundle `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` locally. Do not load Google Fonts in the desktop app.

Thin themed layer only: URL bar + nav + drive bar over `WebContentsView`. Match ChatGPT desktop / Codex browser chrome feel; do not fork a shell package.

## Forbidden (M2a and forever for v1)

- Do **not** create `packages/app/src/renderer/browser/Chrome.tsx` in M2a (no empty stub).
- Do **not** pin or fork `electron-browser-shell`, Reframe, or `electron-as-browser`.
- Do **not** put You’re driving / Return control anywhere except the browser pane.

## Until M5

Browser tab in the `+` menu stays **disabled** with tooltip **Coming in a later build** (same as Terminal/Files in M2).

## M5 owns implementation

`Chrome.tsx` + `WebContentsView` wiring + Playwright `packages/app/e2e/browser.spec.ts` + real-surface verification (navigate → needs-site → allow → You’re driving → Return control).

## Reproduce / reuse

1. Read this file and plan §8 M2a / §5.2 IPC / §6 tokens.
2. Confirm no `Chrome.tsx` and no OSS browser-shell deps:

```bash
cd /path/to/worktree
test ! -f packages/app/src/renderer/browser/Chrome.tsx
rg -n "electron-browser-shell|Reframe|electron-as-browser" package.json packages/*/package.json 2>/dev/null || true
```

3. Implement only in M5.
