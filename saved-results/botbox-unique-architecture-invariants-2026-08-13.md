# Botbox — unique architecture invariants (vs local `claude`/`codex` TUI)

**Date:** 2026-08-13  
**What for:** Exploration brief for later comparison to Claude Code / Codex / OpenCode. Captures what must be true for Botbox’s shape (persistent remote bots, Tauri thin client, Tailscale exit node, interventions) that a local TUI never had to solve.  
**Sources:** `planning/botbox-plan.md`, `planning/botbox-verified-facts.md`, `saved-results/botbox-ui-concept-2026-08-13.html`  
**How to reuse:** Feed “Unique invariants” + cite lines into the cross-product compare agent. Re-read plan if §4.3/§4.7/§4.9 change.

---

## Components Found

| Piece | Role | Lives where |
|---|---|---|
| Tauri app (React/TS) | Thin client: chat, noVNC sidebar, intervention cards, routines, onboarding | User’s Mac |
| Tailscale client (Mac) | Advertises **exit node** = home IP for bot egress | User’s Mac |
| `botd` (Node/TS, systemd) | Owns all state: registry, adapters, conversation loop, memory, routines, interventions, Docker lifecycle, SQLite | VPS |
| ts-sidecar (per bot) | Tailscale in container; bot uses its network namespace + exit node | VPS Docker |
| Bot container | Xvfb + XFCE + x11vnc/noVNC + Chrome (CDP) + `claude`/`codex` CLIs + passwordless sudo | VPS Docker |
| Volumes `/workspace`, `/bot` | Role, memory, state, secrets, chrome-profile, mcp.json | Persist across recreate |
| Playwright MCP | Attaches to **visible** Chrome via CDP `:9222` | Inside bot container |
| botbox MCP | `request_user_action` — blocks turn until user resolves | Container → botd `:7778` |

---

## Flow

### Happy path (message)
User msg (app) → botd WS → queue if turn in flight → adapter resumes session → stream events → botd relays + transcript → `turn-finished` → memory-writer one-shot → idle until next msg / routine / intervention resolve.  
(plan:49–55)

### User closes laptop mid-turn
1. **Turn continues** on VPS: botd + container outlive the app (why exists: plan:5–6, 78). E2E row: quit app 5 min, reopen → progress continued (plan:298).
2. **Exit-node coupling:** if Mac sleeps / Tailscale stops advertising exit node, bot egress **hard-fails** (no auto-fallback). botd health-pings `curl ifconfig.me` every 60s while a turn is active; banner + pause / disable exit node (plan:267–268, 397–398). FAQ: “what if my Mac sleeps?” → exit-node behavior (plan:381).
3. **App reconnect:** `event.stream?after=<lastId>` replays envelopes; WS auto-reconnect+backoff (plan:242, 359).

### User takes over VNC
1. Bot calls `request_user_action` → MCP tool **blocks**; botd creates card; state = `waiting-intervention` ⊂ `thinking` (turn stays in flight) (plan:58–64, 192, 248–249).
2. Sidebar noVNC starts `view_only=true`; “Take over” → interactive (`view_only` off); Done/Skip resolves via WS; tool returns outcome; turn continues in-place (plan:251, 58–64).
3. UI concept states: `needs` / `control`; harness icons disabled while busy (HTML concept + plan:192–193).

### Exit node dies
Hard fail (verified facts:44). Banner within 90s (e2e). One-click disable exit node for that bot (plan:268, 298). Identity consistency beats availability (plan:397–398).

### Harness switch (idle only)
Not blind resume / not raw replay. Compact slice → injectCompact into destination with marker → commit divider + `lastInjectedSeq`. Crash recovery via `reconcileSwitchOps` + marker idempotency (plan:197–230). Shared: role.md, memory/, workspace, Chrome profile; separate: per-harness session ids (plan:196, 165–173).

### App reconnects (multi-bot)
Stream envelopes keyed by `botId` + `turnId` (not sessionId). Two-bot concurrent streams must attach correctly (plan:242).

### Routine tick
`croner` injects user-role turn `source:'routine'` into conversation (plan:253–255). Spend-cap pause causes routines to skip (plan:280).

---

## Files Read

- `planning/botbox-plan.md` (full)
- `planning/botbox-verified-facts.md` (full)
- `saved-results/botbox-ui-concept-2026-08-13.html` (structure + states; concept only)

---

## Boundaries

| Boundary | Admin / control plane | Data plane / agency |
|---|---|---|
| **Mac app** | Viewer only: WS to botd `:7777` (admin token), embeds noVNC | Does **not** own bot process, transcript SoT, or Docker |
| **botd** | SQLite SoT; Docker lifecycle; adapters via `docker exec`; two listeners (admin `:7777` tailnet-only, container `:7778` per-bot gateway only) | Holds `docker.sock` (root-equivalent on host) — accepted residual (plan:283, 401) |
| **Container** | CLI harness + MCP + desktop + Chrome; passwordless sudo **container-only** | Cannot reach other bots’ networks by default (plan:266); can read own `secrets.env` |
| **Home Tailscale** | Exit node identity for bot egress; Mac must stay up for home-IP path | Offline → hard fail; disable-exit-node escape hatch |

App reaches noVNC via sidecar **tailnet IP** (fallback: botd proxies WS). botd reaches :5900/:6080/:9222/CLI via sidecar **docker-bridge IP** (plan:269).

---

## Non-Obvious Things

1. **Two Chrome realities must stay one:** Playwright MCP drives the same Chrome the user sees in noVNC (CDP on non-default profile). Local TUI has no “visible desktop ↔ agent browser” coupling (plan:80, 188; facts:35).
2. **Intervention is a blocked MCP tool call**, not a UI pause — harness turn remains in flight; botd restart mid-intervention must reconnect long-poll to same SQLite row (plan:248–249, 375).
3. **Memory files ≠ harness JSONL:** every turn fires a separate one-shot writer into `/bot/memory`; main session never resumed for memory; harness switch shares memory files but not session files (plan:244–245, 196).
4. **No concurrent harness processes** in one container: memorizing/compacting serialize; queued msgs wait (plan:192). Local TUI is one process; Botbox can otherwise race `~/.claude` / `~/.codex`.
5. **Compact-on-switch is Botbox product logic**, not CLI feature — marker grep for idempotent crash recovery (plan:197–230).
6. **Spend cap includes invisible work:** memory-writer + compact + inject feed same daily accumulator (plan:280, 232).
7. **Apt packages die with container** destroy; volumes keep chrome-profile/memory/workspace (plan:186).
8. **VNC passwordless on whole tailnet** — ACL recommendation, not product enforcement (plan:283).
9. **Trace UI is shared polish** with OpenCode PART_MAPPING — *not* architecture-unique; listed separately so compare agents don’t confuse it with Botbox-only invariants (plan:233–241).

---

## Open Questions (plan silent or ⚠️)

| Gap | Plan status |
|---|---|
| Laptop close while **exit node required** and turn needs egress — does turn error, hang, or only banner? | Covered: hard-fail + banner + pause/disable; exact in-turn CLI failure surface not spelled as a state-machine transition beyond health-ping (plan:267–268). |
| User takeover while agent still has CDP/Playwright tools mid-intervention | Silent on whether Playwright keeps driving Chrome during Take over (race with human input). |
| Multi-bot same exit node contention / bandwidth | Silent. |
| Intervention timeout while app offline | Timeout outcome exists (`timeout_minutes=60`); app offline UX for card not detailed beyond reconnect (plan:248). |
| CLAUDE.md auto-read / resume re-read after compact | ⚠️ M3 empirical + fallback (plan:245, 394). |
| Playwright MCP exact CDP attach flag | ⚠️ re-verify M3 (plan:188, 353). |
| Codex `--json`+MCP silent ignore | ⚠️ #15451, M5 probe (plan:398, facts:25). |
| Automatic disk rotation | Deferred; warn only (plan:281, 402). |
| Whether Stop mid-intervention orphans MCP wait cleanly | Chaos covers botd restart mid-intervention; Stop-during-intervention not explicit in matrix row list. |

---

## Unique invariants

Behaviors that are **loop-breaking or supervision-breaking for this architecture** even if a local `claude`/`codex` TUI never needed them.  
**Covered** = plan specifies behavior + usually a test. **Silent** = architecture implies the problem; plan does not fully specify.

| # | Invariant | Why local TUI never needed it | Plan | Status |
|---|---|---|---|---|
| U1 | **Daemon owns the loop; app may vanish.** Closing the laptop / quitting Tauri must not stop the in-flight turn or lose SoT. | Local TUI *is* the process; close = stop. | plan:5–6, 78; e2e laptop-lid plan:298 | **Covered** |
| U2 | **Exit-node identity is part of the turn’s environment.** Offline exit node = hard fail (no silent VPS-IP fallback); supervision must surface it. | Local agent uses laptop’s normal IP; no separate identity plane. | plan:267–268, 397–398; facts:44 | **Covered** |
| U3 | **Intervention blocks the harness turn in-place** via MCP long-poll; resolving Done/Skip unblocks the same turn. | Local TUI uses interactive permission prompts in-process, not a remote human on a second machine. | plan:58–64, 192, 248–251 | **Covered** |
| U4 | **Human desktop takeover must not race the agent’s browser automation** (view-only default; interactive only after Take over). | No second operator surface. | plan:251; facts:33 | **Partial** — view_only/takeover covered; CDP vs human input race **silent** |
| U5 | **Playwright MCP must attach to the visible Chrome** (same profile/CDP the noVNC shows). | Local often headless or separate browser; no “user watching the same pixels” contract. | plan:80, 188; facts:35 | **Covered** (flag ⚠️ attach flag) |
| U6 | **At most one harness CLI process per bot container** (serialize thinking / memorizing / compacting). | Single local process; no second one-shot writer/compact fighting session dirs. | plan:192 | **Covered** |
| U7 | **Harness switch = compact+inject with durable marker**, not `--resume` across products; crash must leave marker once and consistent `activeHarness`. | Local users don’t hot-swap Claude↔Codex mid-bot with shared desktop/memory. | plan:197–230 | **Covered** |
| U8 | **Per-turn memory files outlive / outrank session JSONL for cross-restart and cross-harness recall.** | Local relies on session resume in one harness; less need for every-turn file memory + CLAUDE.md regeneration. | plan:79, 244–245 | **Covered** (⚠️ CLAUDE.md re-read) |
| U9 | **Routines inject messages while no client is present**; must respect pause/spend-cap. | Local has no daemon cron into a forever conversation. | plan:253–255, 280 | **Covered** |
| U10 | **Thin-client reconnect must catch up without duplicating or orphaning turns** (`after=<lastId>`, botId+turnId). | Local UI and process share memory; no WS envelope replay. | plan:242, 359 | **Covered** |
| U11 | **Multi-bot isolation:** A cannot reach B’s :6080/:9222 or intervention routes. | Local TUI is one agent. | plan:266, 334 | **Covered** |
| U12 | **Passwordless sudo is container-scoped**; hijack can apt-install inside bot, not on VPS host — trust table must say so. | Local sudo is the user’s machine (different blast radius story). | plan:183, 278, 283 | **Covered** (accepted residual) |
| U13 | **Spend cap must include non-chat adapter invocations** (memory-writer, compact, inject) or overnight bots silently burn money. | Local user watches the terminal and stops; no daemon-driven overnight. | plan:280 | **Covered** |
| U14 | **Disk growth from forever bots** (session JSONL + SQLite + chrome-profile) must be observable. | Local sessions are finite human sessions. | plan:281, 402 | **Covered** warn; rotation **deferred/silent** as auto |
| U15 | **Indirect prompt injection via web pages is #1 threat** because unattended Chrome has real cookies/sessions + bypassed permissions. | Local browsing is usually supervised; less “act as user overnight on logged-in sites.” | plan:278–279, 393 | **Covered** (mitigated-not-eliminated + e2e row) |
| U16 | **Orphan harness exec / mid-intervention / mid-compact recovery on botd restart** | Local process death = session ends with the user. | plan:375, 230, 249 | **Covered** |
| U17 | **Two listeners / two token scopes** (admin vs per-bot intervention) | Local has no container→daemon control plane. | plan:257–261 | **Covered** |

### Explicitly *not* unique (shared with local TUIs / OpenCode)

- Part timeline (reasoning / tools / text) — OpenCode `PART_MAPPING` reference (plan:233–241).  
- Stream-json / JSONL parsing, resume, auto-compact inside one harness.  
- Stop/interrupt mid-turn (plan has it, but local TUIs also do).

---

## Inputs → Outputs → Algorithm (this brief)

1. **Inputs:** Botbox plan + verified facts + UI concept HTML.  
2. **Outputs:** Components, flows, boundaries, open questions, unique invariants with cite + covered/silent.  
3. **Algorithm:** Read plan architecture §§1,4.1–4.9,5,8 → map focus topics → separate Botbox-only supervision/loop invariants from shared chat polish → flag gaps.
