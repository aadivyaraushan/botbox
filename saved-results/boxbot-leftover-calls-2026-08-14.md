<!--
Importers/callers: planning/boxbot-local-plan.md (header leftover fold); saved-results/boxbot-plan-vision-review-2026-08-14.md; canvases/boxbot-local-plan.canvas.tsx; AGENTS.md. No runtime importer.
Affected API: None (documentation).
User instruction (verbatim): Documentation-only revision… leftover-fold judge returned REVISE (16 blockers). User then confirmed product locks + homework pins.
-->

# OpenBot leftover product calls — folded 2026-08-14

**Date:** 2026-08-14  
**What this is for:** Record leftover product decisions (after the 11 vision choices) plus implementation homework, including the leftover-fold judge REVISE pins confirmed by the user.  
**Status:** **RESOLVED + FOLDED** into `planning/boxbot-local-plan.md`, `AGENTS.md`, and the plan canvas (judge REVISE pass folded same day).  
**Canonical plan:** `planning/boxbot-local-plan.md`  
**Prior vision fold:** `saved-results/boxbot-plan-vision-review-2026-08-14.md`

## Inputs → Outputs → Algorithm

**Inputs**
- User-confirmed leftover calls (chat, 2026-08-14)
- Leftover-fold judge REVISE (16 blockers) + user-confirmed product + homework pins
- Existing plan + AGENTS.md + canvas

**Outputs**
- This record
- Updated canonical plan / AGENTS.md / canvas / vision-review status

**Algorithm**
1. Lock each leftover call in plain language.
2. Pin homework with exact files, keys, messages, and tests (no “or”).
3. Remove contradictions (fail-closed on built-in shell, must-run-via-MCP, ignore-fields resume, OSS-shell pin, slug MCP, writable_roots homeDir as product, etc.).
4. Search the plan for stale terms and confirm none remain as the product rule.

---

## Leftover product calls (user-confirmed)

### 1. Login automation

| Lock | Detail |
|---|---|
| Permissions | OpenBot requests **Accessibility** + **Screen Recording** (and Apple Events for Chrome) and **clicks Allow itself** |
| Distribution | **M2b:** **ad-hoc / local signing** (not App Sandbox / not Mac App Store); `appId` **`com.openbot.app`**. After each ad-hoc rebuild, re-grant Accessibility + Screen Recording (no stable ad-hoc identity). **Follow-on:** Developer-ID + notarize (not an M2b blocker) |
| No | `cliclick` |
| Helper source | `packages/app/src/native/openbot-axclick.swift` (§5.5.7) |
| CLI | JSON stdin or argv `{ pid?, titles:["Allow","Continue","Authorize","Approve"] }` → AXButton in Chrome AXWebArea → CGEvent click center → exit `{ok, error}` |
| Dev unpackaged | Same helper in `packages/app/helpers/` |
| Packaged | `OpenBot.app/Contents/Helpers/openbot-axclick` (build + ad-hoc sign in **M2b**; source only `packages/app/src/native/openbot-axclick.swift`) |
| Fallbacks | Optional JS Apple Events / vision last |
| Fail closed | Denied permissions (banner + Open System Settings); password / create-account page; button not found |
| Codex | `userCode` typed via System Events |
| Claude | Paste-code only if M1 probe says so |
| Poll | Creds every 1s for **15 min** |
| Open URL | Only `open -a "Google Chrome" -- <url>` |
| Tests | M2: `login-ax.spec.ts` + fake `packages/app/test/fakes/fake-axclick.sh` (CI `ci` project ignores login-ax); **M2b/M7:** real helper on ad-hoc build after re-grant |

### 2. Hindsight packaging

| Lock | Detail |
|---|---|
| Milestone | **Coding-agent milestone M2b** (before stranger test; ad-hoc signed) |
| Ship | **Python 3.11** + `hindsight-all==0.9.0` + **baked weights** via electron-builder `extraResources` (§5.5.8 recipe) |
| Size | **No size cap**; record packaged size in `saved-results/openbot-app-size-YYYY-MM-DD.md` after first package |
| Models | `BAAI/bge-small-en-v1.5`, `cross-encoder/ms-marco-MiniLM-L-6-v2` |
| First use | **Offline**: `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HOME` = bundled/vendored cache; create empty `~/.openbot/hindsight/data` (do **not** copy `pg0`) |
| Dev mode | Same recipe → `DEST=$HOME/.openbot/hindsight` (not `setup-hindsight.sh` as the only path); does **not** overwrite committed `hindsight-pin.json` |
| Writable data | Never write into the bundle; empty `~/.openbot/hindsight/data`; Hindsight creates `pg0` |
| Spawn | `$DEST/bin/hindsight-api` wrapper → `$ROOT/python/bin/hindsight-api` (pip into vendored Python; no `--target`) |
| Pin | `hindsight-pin.json` written only when packaging `DEST=resources/hindsight` |
| Arch | **v1 = Apple Silicon only**; `packages/app/src/main/arch.ts` `isAppleSilicon(): process.arch === 'arm64'`; Intel first launch → **OpenBot needs Apple Silicon.** and do not start daemon |
| Bank id | HTTP **and** MCP = permanent UUID `memoryBankId` |
| MCP URL | `http://127.0.0.1:${port}/mcp/${memoryBankId}/` (trailing slash) |

### 3. Browser chrome

| Lock | Detail |
|---|---|
| Build | Thin themed chrome over Electron `WebContentsView` |
| M2a | **Contract-only** — no `Chrome.tsx` code |
| M5 | Implements `Chrome.tsx` + views + tests + real-surface |
| Preload IPC | `browser.navigate { tabId, url }`, `browser.back { tabId }`, `browser.forward { tabId }`, `browser.reload { tabId }`, `browser.setBounds { agentId, tabId, rect }` |
| Do not | Pin / fork `electron-browser-shell`, Reframe, or `electron-as-browser` |

### 4. Visible shell — **capability first, visibility second**

| Lock | Detail |
|---|---|
| Rule | Prefer visible Terminal tab via MCP. If path missing / probe fails, **keep** built-in Claude Bash and Codex `command_execution`. Never disable a real harness capability for UI. Apply generally. |
| Claude | Prefer `toolAliases: { Bash: 'mcp__openbot__shell_run' }` when present in `sdk.d.ts`. If absent: **do not remove Bash** — skip alias, keep built-in. |
| Codex | Prefer `shell_tool = false` + MCP `shell_run` → `mcp_tool_call`. Else keep `command_execution`. |
| M5 | **Must NOT fail-closed** on built-in shell. Probe asserts preferred path when available; document fallback and still pass. |
| Nested Agent | Private shell **allowed** |
| MCP `shell_run` | Register **only** in `packages/daemon/src/mcp-browser/tools.ts` (no second file). Pin descriptions; `shell-mcp.test.ts` asserts. |
| Focus | Never steals focus; tool-row → `terminal.focus` |
| Terminal Map | `{ agentId, ring, lastWrittenAt?, lastFocusedAt? }`; focus stamps `lastFocusedAt`; read order: latest written → latest focused → else no-terminal |

### 5. agent.delete (memory bank)

| Lock | Detail |
|---|---|
| Order | DELETE bank **first** |
| HTTP 404 | Bank never existed → **proceed** with file/row delete |
| Memory down / non-404 | **Abort**, keep agent, visible error |

---

## Implementation homework (pinned — no “or”)

| ID | Pin |
|---|---|
| A | Codex permission profiles with **absolute-path** filesystem keys (see below). More-specific path wins over `:root`. Daemon expands `os.homedir()`. Tests assert templated keys. No `writable_roots=["homeDir"]`. |
| B | Post-switch continue: **ONLY rewrite** `stopped-turn.json` harness+sessionId to destination. **Delete** the ignore-fields branch. No file → idle, no turn. |
| C | DELETE bank: 404 proceed; non-404 abort (above). |
| D | Composer: paused + Enter → Resume to send (unchanged). |
| E | `tray-notify.test.ts` + `packages/app/vitest.config.ts` + `"test": "vitest run"` + CI step. Path stays `packages/app/src/main/tray-notify.test.ts`. |
| F | **Strip `roleMd`** from `AgentConfig` in M0 (reject in tests). `Turn.costUsd` = last finished `usage.costUsd`. Usage schema **always** `.strict()`. Snapshot recall 4000 vs turn-start 1024 deliberate. IPC: `daemon.request` / `daemon.onEvent`. |
| G | Contradictions removed (below). |
| H | `arch.ts` / `arch.test.ts` as above. |
| I | Packaging = **M2b** (ad-hoc signing; Developer-ID later). |

### Codex `config.toml` filesystem keys (homework A — locked)

```
[permissions.openbot.filesystem]
":root" = "write"
"/Users/<user>/.openbot/agents/<other-slug>" = "read"   # each other agent, rewritten on create/delete
"/Users/<user>/.openbot/private" = "deny"
"/Users/<user>/.openbot/claude-config" = "deny"
"/Users/<user>/.openbot/codex-home" = "deny"
"/Users/<user>/.openbot/hindsight" = "deny"
"/Users/<user>/.openbot/team.json" = "deny"
"/Users/<user>/.openbot/login-url" = "deny"
```

Also keep `[features] default_mode_request_user_input = true` and preferred `shell_tool = false` when the visible-shell path is available.

---

## Contradictions removed by this fold (+ judge REVISE)

- “Main-agent shell **must** run via MCP” / fail M5 on Bash/`command_execution` → **capability first**; preferred MCP; built-in fallback; M5 does not fail-closed
- “Omit Bash if no alias” → keep Bash; skip alias if `toolAliases` absent from `sdk.d.ts`
- Post-switch “rewrite **or** ignore fields” → **only rewrite**
- OSS browser-shell pin / M2a implement Chrome.tsx → thin contract in M2a; **M5** implements Chrome.tsx
- Hindsight MCP `/mcp/<slug>/` → `/mcp/${memoryBankId}/`
- Codex `writable_roots=["<homeDir>"]` as product → permission profile absolute paths
- DELETE fail-closed on any failure → **404 proceed**; non-404 abort
- `roleMd` pin-or-strip → **strip**
- usage “reject unknown keys **if** `.strict()`” → **always** `.strict()`
- `setup-hindsight.sh` as only path → same extraResources recipe locally; packaging **M2b**
- shell_run in tools.ts **or** shell-tools.ts → **only** `mcp-browser/tools.ts`

## Capability-first fold (2026-08-14) — FOLDED

Judge: `saved-results/boxbot-capability-first-fold-judgment-2026-08-14.md` (REVISE → 10 homework blockers). User locked: M2b ad-hoc signing; M7 on ad-hoc; no size cap. All 10 blockers folded into `planning/boxbot-local-plan.md` the same day (§5.5.8 recipe, `--strict-config`, axclick one-path + Swift body, electron-builder.yml, shell fallback tests, null-destination resume, M0 keep completeLogin, invalid-model, CI vitest step, etc.).

## Still-unresolved user choices

**None** except GitHub repo rename later. Product is **OpenBot** (`com.openbot.app`, `~/.openbot`, `@openbot/*`, `OPENBOT_*`, MCP `openbot`, `openbot-axclick`). Leftover calls, judge REVISE pins, capability-first homework, and packaging/login/hindsight blockers are locked. Developer-ID + notarize is a documented follow-on after M2b, not a remaining choice.

## Packaging / login / hindsight judge blockers (2026-08-14) — FOLDED

Folded into `planning/boxbot-local-plan.md` the same day (docs only):

1. §5.5.8 writes `bin/hindsight-api` wrapper; pip install into vendored Python (no `--target` / no “python -m or”).
2. First-use: empty `~/.openbot/hindsight/data`; do not copy `pg0`.
3. `hindsight-pin.json` only when packaging `DEST=resources/hindsight`.
4. Full `electron-builder.yml` / entitlements / `after-pack.cjs` bodies; `appId` `com.openbot.app`.
5. M2 builds helper before `login-ax`; fake-axclick for CI; Playwright `ci` + `local-ax`; re-grant after each ad-hoc rebuild (M2b + M7).
6. M5 pins `@electron/rebuild` 4.x; delete “or electron-vite equivalent”.

