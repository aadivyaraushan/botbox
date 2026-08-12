# Botbox — Implementation Plan

**Date:** 2026-08-12 (v2 — research-verified; see `planning/botbox-verified-facts.md` for every external fact + source and the ⚠️ unverified list). Amended 2026-08-13: passwordless sudo inside the bot container + 4g/2-cpu default; composer harness switcher; compact-on-switch; part timeline. Amended again 2026-08-13 (invariant-gap fold). **Host OS:** known-good box is Debian (8 vCPU / 16 GB / 128 GB); bot *image* stays `ubuntu:24.04` (Claude Code / Codex run in the container, not on the host).
**What:** Open-source, self-hostable system of persistent, role-based AI agents ("bots") that live on a remote Linux server, each in its own desktop container, act on the user's behalf (terminal + Chrome) with traffic egressing via the user's home IP, controlled from a Tauri desktop app.
**Why:** Terminal coding agents are bad at long autonomous runs. Bots need a durable machine, a real desktop, the user's network identity, and a supervising daemon that outlives the user's laptop.

---

## 1. The system at a glance

```
┌────────────────────────── User's Mac ──────────────────────────┐
│  ┌───────────────────────────────┐   ┌──────────────────────┐  │
│  │  Botbox Tauri app (React/TS)  │   │  Tailscale client    │  │
│  │  - chat per bot               │   │  (advertises         │  │
│  │  - live screen sidebar (noVNC)│   │   EXIT NODE =        │  │
│  │  - intervention cards         │   │   user's home IP)    │  │
│  │  - routines UI, onboarding    │   └──────────▲───────────┘  │
│  └───────────────┬───────────────┘              │              │
└──────────────────┼──────────────────────────────┼──────────────┘
                   │ WebSocket (tailnet)          │ WireGuard (bot egress)
                   ▼                              │
┌────────────────────────── User's VPS (Debian) ─┼──────────────┐
│  ┌──────────────────────────────────────────┐  │              │
│  │  botd (Node/TS daemon, systemd service)  │  │              │
│  │  registry · adapters · conversation loop │  │              │
│  │  per-turn memory · routines · interven-  │  │              │
│  │  tions · Docker lifecycle · SQLite       │  │              │
│  └───────┬──────────────────────────────────┘  │              │
│          │ docker exec / HTTP (bridge net)      │              │
│  ┌───────▼──────────────────┐  per bot:         │              │
│  │ ts-sidecar (tailscale)   │──uses exit node───┘              │
│  │   └─ network namespace ◄─┐                                  │
│  │ bot container            │ network_mode: container:sidecar  │
│  │  Xvfb :1 + XFCE desktop  │                                  │
│  │  x11vnc :5900            │  noVNC :6080 (app embeds this)   │
│  │  Chrome (CDP :9222,      │                                  │
│  │   persistent profile)    │                                  │
│  │  claude / codex CLIs     │                                  │
│  │  volumes: /workspace,    │                                  │
│  │   /bot (role, memory,    │                                  │
│  │   state, secrets)        │                                  │
│  └──────────────────────────┘                                  │
└────────────────────────────────────────────────────────────────┘
```

**One bot =** one container pair (tailscale sidecar + desktop container) + one continuous harness conversation (resumed forever, harness auto-compact) + `role.md` + `memory/` written **every turn** + optional routines. No concept of "runs."

### Message flow

```
User msg (app) ─► botd WS ─► queued if turn in flight ─► adapter resumes
session, streams events ─► botd relays to app + appends transcript ─►
turn-finished ─► memory-writer one-shot fires ─► idle until next
message / routine tick / intervention resolution
```

### Intervention flow

```
Bot calls mcp tool request_user_action ─► tool blocks; botd creates card,
pushes to app ─► user sees "Needs your attention" + live screen ─►
Take over (interactive noVNC) ─► "I'm done" / "Skip" ─► tool call returns
with outcome ─► bot's turn continues in-place
```

---

## 2. Decision record (interview, 2026-08-12)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Audience | Open source, self-hostable, single-tenant per install |
| 2 | Server | BYO **Debian** box (known-good: 8 vCPU / 16 GB / 128 GB) + bootstrap; optional Hetzner Ubuntu path for strangers |
| 3 | Network | Tailscale everywhere; user's machine = exit node (home-IP egress) |
| 4 | Harness abstraction | Adapters over headless JSON modes |
| 5 | Client | Tauri desktop app (React/TS), thin client |
| 6 | Brain location | `botd` on the server owns all state; app is a viewer |
| 7 | Bot persistence | `role.md` + `memory/` files, memory written **every turn**; one continuous conversation |
| 8 | Web agency | Chrome in bot desktop; Playwright MCP attached to the *visible* Chrome via CDP |
| 9 | Stack | TypeScript everywhere |
| 10 | Adapters v1 | Claude Code + Codex; Cursor = good-first-issue |
| 11 | Credentials | User logs in by hand on the bot's visible screen (interventions); `secrets.env` for API keys |
| 12 | Isolation | One Docker container per bot + tailscale sidecar, per-bot volumes, cgroup limits |
| 13 | Routines | Cron in daemon injects messages into the conversation; minimal UI |
| 14 | Name | **Botbox** (working name; availability check before publish) |
| 15 | Harness switch | Per-bot, idle only; icons above composer. Switching **compacts** the transcript so far into the destination harness (not a blind resume). |
| 16 | Trace UI | Chat shows reasoning tokens and tool traces the way Claude Code / Codex / OpenCode do (OpenCode `PART_MAPPING` is the OSS reference). |
| 17 | Harness icons | Real product marks, black-and-white (`currentColor`): Claude Code spark, Codex/OpenAI blossom. No decorative stand-ins. |
| 18 | Take over vs Playwright | On Take over, human owns mouse/keyboard; Playwright/browser MCP tools **abort/fail** until Done/Skip (flag file + gated MCP). |
| 19 | Exit node dies mid-turn | After **2 consecutive** failed egress pings (~120s): interrupt harness, record fatal `exit-node-offline`, **auto-pause** bot; banner already on first failure. |
| 20 | Stop during intervention | `chat.stop` resolves open intervention as `skipped`, clears human-control, then `interrupt`; queue kept. |
| 21 | Queue / Stop / states in UI | Queue shows a **count badge** (not silent); `chat.stop` is a first-class WS message; bot chrome shows state chip + static trust chip + today's spend. |
| 22 | Mac alert for interventions | Tauri OS notification when an intervention opens and the app is unfocused (or window not visible). |
| 23 | File transfer Mac↔workspace | **Out of scope v1** — use chat/tools or Take over on the desktop. |
| 24 | Coding-agent polish deferred | No edit/regenerate, fork UI, slash palette, `@`/image composer, todos dock, plan/read-only mode, transcript search, checkpoints — see §8. |

User's additional requirements (binding):
- Exhaustive tests **before** implementation: unit + integration + e2e, senior-dev-level.
- Every capability verified end-to-end **through computer-use**, realistic to consumer usage.
- Finish = public GitHub repo, professional, clone instructions, motivation, good-first-issue issues. Style: hindsight-style README (blueprint in facts appendix), pgGraph-style hygiene.

**Money rule checkpoints (hard):** before any implementation step that spends money — live harness tests (Anthropic/OpenAI API), optional Hetzner get-a-box, Tailscale account tier — the implementer states the literal account/key source and gets explicit OK. Estimated at bottom of §7. The author's box already exists (Debian, 8/16/128); do not create a Hetzner VM unless asked.

---

## 3. Monorepo layout

```
botbox/
├── README.md  LICENSE(MIT)  CONTRIBUTING.md  SECURITY.md  .github/
├── packages/
│   ├── protocol/            # shared zod schemas + TS types (no runtime deps beyond zod)
│   │   └── src/{messages,domain}/
│   ├── daemon/              # botd
│   │   └── src/{api,bots,adapters/{claude-code,codex},memory,
│   │            routines,interventions,containers,store,mcp}/
│   ├── app/                 # Tauri v2 + React + Vite
│   │   └── src/views/{chat,screen,onboarding,routines}/  src-tauri/
│   └── bot-image/           # Dockerfile + supervisord + entry scripts
├── scripts/
│   ├── bootstrap.sh
│   └── get-a-box/           # Hetzner helper (hcloud CLI wrapper)
├── e2e/                     # computer-use verification suites + MATRIX.md
└── planning/  saved-results/
```

pnpm workspaces; TS 5.x strict; vitest; prettier. Node 22 LTS everywhere.

---

## 4. Component specs

### 4.1 Harness adapter interface (`packages/daemon/src/adapters/adapter.ts`)

```ts
export interface HarnessAdapter {
  readonly id: 'claude-code' | 'codex' | string;
  healthcheck(ctx: BotContext): Promise<HealthReport>;
  send(ctx: BotContext, message: string): AsyncIterable<HarnessEvent>;
  injectCompact(ctx: BotContext, message: string): AsyncIterable<HarnessEvent>; // no tools; --max-turns 1
  interrupt(ctx: BotContext): Promise<void>;
}

// Canonical type: packages/protocol/src/domain/harness-event.ts (zod + inferred type).
// Daemon imports it from `@botbox/protocol` and MUST NOT declare a second copy.
export type HarnessEvent =
  | { kind: 'turn-started'; sessionId: string }
  | { kind: 'reasoning-text'; partId: string; delta: string }   // append-only
  | { kind: 'assistant-text'; partId: string; delta: string }   // append-only
  | { kind: 'tool-use'; callId: string; name: string; inputSummary: string }
  | { kind: 'tool-result'; callId: string; name: string; ok: boolean; outputSummary?: string }
  | { kind: 'compacted'; forHarness: string }
  | { kind: 'turn-finished'; sessionId: string; usage?: { costUsd?: number } }
  | { kind: 'error'; message: string; fatal: boolean };
```

Parsers emit **deltas only** (never a full-snapshot replacement). `partId` / `callId` come from the CLI when present (Claude `content_block.index` as `c${index}`; Codex `item.id`); if the CLI omits an id, the parser assigns a stable uuid for that block and reuses it for later deltas of the same block. `tool-result` MUST carry the same `callId` as its `tool-use`.

Reducer (exact symbol): `packages/daemon/src/bots/transcript-reducer.ts` `applyEvent(parts: TurnPart[], ev: HarnessEvent): TurnPart[]`
1. `reasoning-text`: find `{type:'reasoning', id: partId}`; if missing, push `{type:'reasoning', id: partId, text: delta}`; else `text += delta`.
2. `assistant-text`: same for `{type:'text', id: partId}`.
3. `tool-use`: push `{type:'tool', id: callId, name, inputSummary}`.
4. `tool-result`: find `{type:'tool', id: callId}`; set `outputSummary`, `ok`; if missing, push a tool part with those fields (result-without-use).
5. `compacted`: push `{type:'compaction', forHarness}`.
6. Other kinds: no part change.

Dedup (Claude): if `thinking_delta` / content_block `thinking` already produced `reasoning-text` for `c${index}`, ignore a later `assistant` message `thinking` copy for that same index.

Adapter rules:
- CLI runs **inside the bot container**: `docker exec -u bot -w /workspace -e DISPLAY=:1 <container> <cli …>`; stdout parsed line-by-line as JSONL.
- Session ids persisted at `/bot/state/session.json`:
  ```json
  {
    "activeHarness": "claude-code",
    "sessions": { "claude-code": "…", "codex": "…" },
    "lastInjectedSeq": { "claude-code": 0, "codex": 0 }
  }
  ```
  Each harness keeps its own session; missing `sessions[harness]` = first call creates a new session on that harness. `lastInjectedSeq` is the last **visible** `Turn.seq` that harness has been brought current through (used by compact-on-switch, §4.3). SQLite is source of truth for `activeHarness` / `lastInjectedSeq` / session ids; `session.json` is rewritten from the DB after every committed switch or turn-start (`writeSessionJson(botId)`). Never `--fork-session`.
- **Claude Code mapping** (verified): first `send`: `claude -p "<msg>" --output-format stream-json --verbose --include-partial-messages --append-system-prompt-file /bot/role.md --mcp-config /bot/mcp.json --strict-mcp-config --permission-mode bypassPermissions`; later `send` adds `--resume <id>`. **injectCompact first call** (no `sessions[to]`): `claude -p "<msg>" --output-format stream-json --verbose --include-partial-messages --append-system-prompt-file /bot/role.md --allowedTools "" --max-turns 1 --permission-mode bypassPermissions` (no `--mcp-config`). **injectCompact resume**: same plus `--resume <id>`. ⚠️ empty `--allowedTools`: if CLI rejects, drop the flag and fail the inject if any `tool-use` appears. Events: `system/init`→`turn-started`; `stream_event` `text_delta`→`assistant-text` `partId=c${index}`; `stream_event` `thinking_delta` / content_block `thinking`→`reasoning-text` `partId=c${index}` (⚠️ M3 live capture; if none, keep hand-crafted `thinking.jsonl`); `assistant` tool_use→`tool-use` `callId`=tool_use `id`; tool_result→`tool-result` same `id`; `result`→`turn-finished` (subtype≠success→`error`).
- **Codex mapping** (verified): first `send`: `codex exec "<msg>" --json --sandbox danger-full-access --ask-for-approval never`; later `codex exec resume <threadId> "<msg>" --json …`. **injectCompact first call**: `codex exec "<msg>" --json --sandbox read-only --ask-for-approval never`. **injectCompact resume**: `codex exec resume <threadId> "<msg>" --json --sandbox read-only --ask-for-approval never`. `thread.started`→`turn-started`; `item.completed` type `agent_message`→`assistant-text` `partId=item.id` text=`item.text`; `item.completed` type `reasoning`→`reasoning-text` `partId=item.id` text=`item.text` (if missing: `item.content` if string, else JSON.stringify — pin winner from `packages/daemon/test/fixtures/codex/reasoning.jsonl` in the parser PR). Tool lifecycle (hand-crafted fixture asserts this table; live M5 may update table+fixture together): `item.started` type `command_execution`→`tool-use` `callId=item.id` `name='Bash'` `inputSummary=item.command` (200 chars); `item.completed` type `command_execution`→`tool-result` same `callId` `ok=(item.exit_code===0)` `outputSummary=(item.aggregated_output||item.output||'').slice(0,500)`; `item.started` type `mcp_tool_call`→`tool-use` `name=item.tool||'mcp'` `inputSummary=JSON.stringify(item.arguments||{}).slice(0,200)`; `item.completed` type `mcp_tool_call`→`tool-result` `ok=(item.status!=='failed')`; types `file_change`/`web_search`/`plan_update` same pair with `name=item.type`. Do **not** emit `tool-use` on `item.completed` (duplicates). `item.started` without completed stays a running row (`ok` unset). `turn.completed`→`turn-finished`; `turn.failed`/`error`→`error`. Role via `/workspace/AGENTS.md`; MCP via `~/.codex/config.toml`.
- Auth (in-container env from `/bot/secrets.env`): Claude `ANTHROPIC_API_KEY` **or** `CLAUDE_CODE_OAUTH_TOKEN` (minted once via `claude setup-token`); Codex `codex login --with-api-key` at container provision, or device-auth for ChatGPT plans.

### 4.2 Bot container image (`packages/bot-image/`)

Custom Dockerfile (webtop/Selkies rejected — no input-injection API; facts appendix):
- `FROM ubuntu:24.04`. Install: `xvfb x11vnc novnc websockify xfce4 xfce4-terminal dbus-x11 xdotool fonts-noto supervisor curl git sudo`, Node 22 (nodesource), `npm i -g @anthropic-ai/claude-code@<pin> @openai/codex@<pin> @playwright/mcp@<pin>` — **exact versions pinned in the Dockerfile** (the parser fixtures are captured from these binaries; version bumps are a deliberate PR that re-captures fixtures — process documented in CONTRIBUTING.md). Browser: **`google-chrome-stable` via Google's apt repo `.deb`** — NOT `apt install chromium-browser`, which on Ubuntu 24.04 is a snap wrapper that fails in unprivileged containers (⚠️ judge-flagged; the M1 image test asserting CDP answers is the verification).
- User `bot` (uid 1000). `DISPLAY=:1`, screen `1280x800x24`.
- **Passwordless sudo:** after creating user `bot`, write `/etc/sudoers.d/bot` with exactly `bot ALL=(ALL) NOPASSWD:ALL` and `chmod 440`; `visudo -c` must pass in the image build. The agent runs as `bot` (`docker exec -u bot`) and can `sudo apt-get install` (or any other root command) without a password. Sudo is **inside the container only** — it does not reach the VPS host.
- supervisord programs: `Xvfb :1` → `xfce4-session` → `x11vnc -display :1 -forever -shared -rfbport 5900 -nopw` → `websockify --web /usr/share/novnc 6080 localhost:5900` → `chrome-launcher.sh` (`chromium --remote-debugging-port=9222 --user-data-dir=/bot/chrome-profile --no-first-run`; non-default profile dir is **mandatory**, Chrome≥136 blocks CDP on default).
- XFCE panel pre-pinned: Chromium + xfce4-terminal (the "dock").
- Volumes: `/workspace`, `/bot` (`role.md`, `memory/`, `state/`, `secrets.env` 0600, `chrome-profile/`, `mcp.json`). Apt packages live in the container filesystem, not these volumes — they persist for the life of the container (the normal case) and are lost on `destroyBotPair` (volumes are kept; the agent can reinstall).
- Limits from bot config: `--memory 4g --cpus 2` defaults (`BotConfig.memoryLimitMb` / `cpus` override). `--shm-size 1g` (Chrome needs it). A 4g bot does not fit on a 4 GB VPS. Known-good host is **8 vCPU / 16 GB / 128 GB Debian** (room for ~2 bots at the 4g default, plus Docker/OS). Optional guided Hetzner box remains 8 GB class (`cx33`) for people without a box. KVM/`/dev/kvm` is **not** passed in — hardware-accelerated nested VMs stay out of v1; user-space tools and `apt` packages are in.
- `/bot/mcp.json` registers: `playwright` (`@playwright/mcp` — attach to visible Chrome over CDP :9222; exact attach flag re-verified at M3) and `botbox` (intervention server, §4.4).

### 4.3 Conversation + memory loop (`src/bots/`)

- State machine per bot: `idle → thinking → memorizing → idle`; `idle → compacting → idle` on harness switch; `waiting-intervention` is a sub-state of `thinking` (turn stays in flight while the MCP tool blocks); `error` from anywhere; 3 retries exp-backoff on transient CLI failure, then surface. **`memorizing` and `compacting` serialize against the main session**: queued messages are not sent until the writer/compact exec completes (prevents two harness processes sharing `~/.claude` / `~/.codex` state in one container). Harness icons are disabled in every non-idle state.
- **Harness switch (composer icons):** `bot.setHarness` is allowed only in `idle` (rejected with `error: harness-switch-busy` while thinking / waiting-intervention / memorizing / compacting). App: two icon buttons **above the composer**. Icons are the **real product marks**, `fill="currentColor"` (black-and-white, selected = lime accent):
  - Claude Code: Anthropic spark from Claude Code VS Code extension **2.1.228** `resources/claude-logo.svg`, `fill="currentColor"` (not `#D97757`). Path `d` sha256 `7c9c195500ec3caed3a183d8f8758a2252955ee76af691b3fc5c20b3cd8caa58`. Ship as `packages/app/src/assets/harness/claude-code.svg`. M4 test: file exists and sha256 of the `d` attribute matches.
  - Codex: OpenAI blossom — this **is** the Codex IDE mark (Open VSX `openai.chatgpt` 26.5803.61601 `files.icon` = `blossom.dark.png`). SVG path = simple-icons `openai` (CC0-1.0). Path `d` sha256 `8af0a604a2db2bd30ac22d6a968dfa731fe00436c6e85a33b6b45215182c83e8`. Ship as `packages/app/src/assets/harness/codex.svg`. M4 test: file exists and sha256 of the `d` attribute matches.
  Selected = active; this is not a per-message model picker: one in-flight turn uses one harness. App transcript is per-bot; each assistant turn is tagged with the harness that produced it. `role.md`, `memory/`, workspace, and Chrome profile are shared.
- **Compact-on-switch (invariant):** switching A→B does **not** start B blind and does **not** replay the raw transcript into B. `packages/daemon/src/bots/harness-switch.ts` `switchHarness(botId: string, toHarness: 'claude-code'|'codex'): Promise<{ok:true, harness:string} | {ok:false, error:'harness-switch-busy'|'compact-failed'|'inject-failed'|'spend-cap'}>`.

  SQLite table `harness_switch_ops` (`packages/daemon/src/store/migrations/00N_harness_switch.sql`): `{id TEXT PK, botId, fromHarness, toHarness, status: 'compacting'|'injecting'|'done'|'failed', sliceThroughSeq INTEGER, injectMarker TEXT UNIQUE, compactText TEXT, error TEXT, createdAt, updatedAt}`. `Turn.seq` is INTEGER, unique per `botId`, assigned `MAX(seq)+1` in the same write transaction (never a UUID for ordering).

  Algorithm:
  1. In one SQLite transaction: if bot `state !== 'idle'` OR an op exists with `status IN ('compacting','injecting')` for this bot, return `{ok:false, error:'harness-switch-busy'}`. If `toHarness === activeHarness`, return `{ok:true}` no-op. Else set `state='compacting'`, insert op `{status:'compacting', injectMarker: op.id, sliceThroughSeq: MAX(visible seq)}`.
  2. Visible slice: `SELECT * FROM turns WHERE botId=? AND hidden=0 AND seq > lastInjectedSeq[to] AND seq <= sliceThroughSeq ORDER BY seq`. **Empty slice → flip only:** one transaction sets `bots.harness=to`, op `status='done'`, `state='idle'` (do **not** insert a compaction turn, do **not** emit `compacted`, do **not** call compact or inject). `lastInjectedSeq` already equals `sliceThroughSeq` in this case. Return `{ok:true, harness:to}`.
  3. Serialize slice to plain text (user text, assistant text, tool name + one-line summary; **omit** raw tool dumps and reasoning). Cap: take the newest whole turns whose joined length is ≤ 32 000 UTF-16 code units; if older turns drop, prefix `[earlier turns omitted]\n`. Never split a turn in half.
  4. `compactTranscript(ctx, text): Promise<string>` in `packages/daemon/src/memory/compact.ts`. One-shot, never `--resume`. Prefer Claude when `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is in `/bot/secrets.env`:
     `docker exec -u bot -w /tmp <container> claude -p "<text>" --output-format stream-json --verbose --model claude-haiku-4-5 --append-system-prompt-file /opt/botbox/compact-prompt.md --allowedTools "" --max-turns 1 --permission-mode bypassPermissions`
     (no `--mcp-config`). Else: `codex exec "<text>" --json --sandbox read-only --ask-for-approval never` with compact-prompt prepended. Fail the switch (`status=failed`, `activeHarness` stays `from`, `state=idle`) if: compact throws, result empty/whitespace, result has any `tool-use`, spend cap would be exceeded, or length > 8000 chars after trim (hard cap; prompt says 1200 words). Persist `compactText` on the op before inject.
  5. Compact prompt file `packages/daemon/src/memory/compact-prompt.md` (image path `/opt/botbox/compact-prompt.md`), exact body:
     ```
     You summarize a bot conversation so a different coding agent can continue the same work.
     Output a compact handoff covering: goal, what is done, what is blocked, files/URLs that matter, next step.
     No tools. No questions. Plain prose. At most 1200 words.
     ```
  6. Set op `status='injecting'`. Wrap (exact; `injectMarker` is the op id):
     ```
     [harness-switch-compact marker=<injectMarker> from=<from> to=<to>]
     The previous coding agent compacted the conversation so far. Continue from this summary. When you have it, reply with exactly: Ready.

     <compact text>
     ```
     Call **`adapter.injectCompact`** (not `send`). **Marker lookup** (idempotent retry / restart): search the destination harness's session files for the literal substring `marker=<injectMarker>`.
     - Claude, when `sessions[to]` is set: `docker exec -u bot <container> grep -l "marker=<injectMarker>" /home/bot/.claude/projects/-workspace/<sessionId>.jsonl` (cwd `/workspace` encodes as `-workspace`; if M3 live shows a different encoded path, update this one string in the same PR as the probe).
     - Claude, when `sessions[to]` is missing: `grep -rl "marker=<injectMarker>" /home/bot/.claude/projects/-workspace/` — if a file matches, its basename (minus `.jsonl`) **is** the session id; persist it to `sessions[to]` and skip the CLI call.
     - Codex, when `sessions[to]` is set: `grep -l` that thread's JSONL under `/home/bot/.codex/sessions/`.
     - Codex, when missing: `grep -rl "marker=<injectMarker>" /home/bot/.codex/sessions/` — matching file's thread id (the `thread_id` inside the first `thread.started` line, not the filename) is `sessions[to]`.
     If marker found: skip CLI, treat inject as already succeeded, go to step 7. If not found: run injectCompact. Persist the destination turn `source:'harness-switch-compact' hidden:true`. **Inject success** (all required): exactly one `turn-started`, then any number of `assistant-text`/`reasoning-text`, **zero** `tool-use`, **zero** `error`, exactly one `turn-finished`, and `sessionId` from `turn-started` written to `sessions[to]`. Fail (`inject-failed`) if the stream ends without `turn-finished`, emits `error`, emits `tool-use`, emits a second `turn-started` or second `turn-finished`, or throws. Assistant text need not equal `Ready` (log warn if it doesn't).
  7. **Single SQLite transaction** `commitHarnessSwitch(op)`: insert visible `{type:'compaction', forHarness:to}` turn at next seq; set `bots.harness=to`, `lastInjectedSeq[from]=lastInjectedSeq[to]=sliceThroughSeq`, op `status='done'`, bot `state='idle'`. Then `writeSessionJson(botId)` from DB. Emit `{kind:'compacted', forHarness:to}`. Return `{ok:true, harness:to}`.
  8. Switching back is the same function with names swapped (slice is `seq > lastInjectedSeq[A]`).

  **Restart recovery** (`packages/daemon/src/bots/harness-switch.ts` `reconcileSwitchOps()`, called from botd boot next to the existing orphan-exec scan): for each op `compacting` → rerun from step 2 using stored `sliceThroughSeq` (do not re-slice live); for each op `injecting` → step 6 (marker makes it idempotent); `done`/`failed` left alone. M6 chaos row: kill botd mid-compacting and mid-injecting; after restart, destination session contains the marker **once**, UI shows one divider, `activeHarness` matches SQLite.

  Log tag `[harness-switch]`: `bot`, `from`, `to`, `op`, `sliceTurns`, `compactChars`, `inject=ok|fail` (no transcript dump, no secrets). Spend: compact + inject turns feed the daily cap (§4.9).
- **Trace UI (invariant):** the chat is a **part timeline**, not a single blob of assistant text. Match Claude Code / Codex / OpenCode. Open-source reference: OpenCode `packages/ui/src/components/message-part.tsx` `PART_MAPPING` (`reasoning`, `tool`, `text`, `compaction`) — fetched 2026-08-13 from `anomalyco/opencode@5d2dc888`. Botbox mapping (parts carry `id` = `partId`/`callId`):

  | HarnessEvent | Transcript part | UI |
  |---|---|---|
  | `reasoning-text` | `{ type: 'reasoning', id, text }` | collapsible; summary **Thinking** while the turn is in flight, collapsed after `turn-finished` |
  | `tool-use` / `tool-result` | `{ type: 'tool', id, name, inputSummary, outputSummary?, ok? }` | named row (`Bash · …`); expand for output; pair by `id` |
  | `assistant-text` | `{ type: 'text', id, text }` | markdown body |
  | `compacted` | `{ type: 'compaction', forHarness }` | centered divider, label `Compacted for Codex` / `Compacted for Claude Code` |

  Reasoning tokens are first-class and **must not be dropped**. `event.stream` pushes `{id:number, botId:string, turnId:string, event:HarnessEvent}` (`turnId` = the in-flight turn UUID created before the first event). `chat.history` returns `{ turns: Turn[] }` with `hidden` turns omitted. `bot.setHarness` replies with the `switchHarness` result union above. App view: `packages/app/src/views/chat/PartTimeline.tsx`. Stream reconnect: client sends `event.stream?after=<lastId>`; daemon replays envelopes with `id > after` for that connection's bots. Reducer is append-only keyed by `partId`/`callId` **within `turnId`**. Two-bot test: mock daemon streams bot A and bot B concurrently; UI attaches events using `botId`+`turnId`, not sessionId.
- Messages arriving mid-turn queue FIFO; on next send they're concatenated into one message with `---` separators and source tags. **Interrupt does not discard the queue**: after a Stop, queued messages are delivered as the next turn (prefixed `[previous turn was interrupted by the user]`).
- **Per-turn memory write:** on every `turn-finished`, daemon runs a one-shot memory writer via the bot's own adapter: `claude -p` (or `codex exec`) with cwd `/bot/memory`, system prompt = fixed memory-writer prompt (inputs: last turn's transcript tail ≤8k chars + current `MEMORY.md`), tools limited to Read/Write/Edit, cheap model (claude: `--model claude-haiku-4-5`; codex: config default). Format: `MEMORY.md` one-line index + one fact per file (mirrors the proven CLAUDE.md memory pattern). Never resumes the main session.
- **Role + memory injection:** daemon generates `/workspace/CLAUDE.md` and `/workspace/AGENTS.md` (same content: role.md + MEMORY.md index) before every turn; Claude additionally gets `--append-system-prompt-file /bot/role.md`. ⚠️ TWO unverified assumptions here, both resolved empirically at M3 step 6: (a) whether headless `claude -p` auto-reads `CLAUDE.md` from cwd at all, and (b) whether a *resumed* session re-reads it after auto-compact. Fallback for either being false: daemon prepends a one-line `[memory updated: see MEMORY.md]` note to the next user message whenever memory changed.

### 4.4 Interventions (`src/interventions/`, `src/mcp/`, app `views/screen/`)

- `botbox` MCP server = small stdio Node script in the container (`/opt/botbox/mcp-server.js`), one tool: `request_user_action({title, instructions, timeout_minutes=60})`. It POSTs to botd's **container-facing listener** (`http://<bot-network-gw>:7778/interventions`, per-bot token from `/bot/secrets.env`) and **blocks until resolved**, returning `{outcome: 'done'|'skipped'|'timeout'}` — so the bot's turn waits in place, exactly like the Grok Bot screenshot. The wait is a long-poll (`GET /interventions/:id/wait`, 30s cycles) **with retry + backoff up to the timeout**, and interventions are persisted in SQLite — so if botd restarts mid-intervention, the container-side poll reconnects and finds the same intervention; if the bot's harness process died instead, botd marks the intervention orphaned on resolve and surfaces that in the app.
- Intervention object: `{id, botId, title, instructions, status: open|done|skipped|timeout, createdAt, resolvedAt}` (SQLite).
- App: persistent sidebar = noVNC iframe `http://<bot-tailnet-ip>:6080/vnc.html?view_only=true&autoconnect=true`; "Take over" swaps to interactive noVNC (view_only off); Done/Skip buttons resolve via WS. The app reaches bot noVNC **directly over the tailnet** (each sidecar is a tailnet device); fallback if unreachable: botd proxies the websocket.

### 4.5 Routines (`src/routines/`)

`{id, botId, schedule (cron), message, enabled}` in SQLite; `croner` fires → injects message as user-role turn tagged `source:'routine'`. UI: list/create/edit/pause per bot. No run-history UI (transcript shows fired messages).

### 4.6 botd API (`src/api/`)

Two listeners, two token scopes (fixes the "who can reach what" boundary):
- **Admin listener** — Fastify + `ws` bound to the **tailnet interface only**, port 7777. Full API, zod-validated from `packages/protocol`: `bot.create|list|get|delete`, `bot.setExitNode`, `bot.setHarness`, `chat.send`, `chat.history`, `event.stream` (server-push HarnessEvents), `intervention.list|resolve|skip`, `routine.create|update|delete|list`, `server.health`. Auth: **admin token** generated at bootstrap (`/etc/botbox/token`), stored in app via Tauri secure storage.
- **Container listener** — plain HTTP bound to the **per-bot docker network gateway interfaces only**, port 7778. Binds are **dynamic**: `bot.create` adds a bind on the new bot's gateway IP, `bot.delete` removes it; never bind `0.0.0.0`. Routes: `POST /interventions`, `GET /interventions/:id/wait` — nothing else exists on this listener. Auth: **per-bot token** (random, written to that bot's `/bot/secrets.env` at provision), valid only for interventions belonging to that bot. A per-bot token presented to the admin listener (or for another bot's intervention) is rejected — tested explicitly, including the dynamic case (bot created after daemon start can reach the listener from its own network only; pre-existing bots unaffected).

### 4.7 Networking / egress (per bot)

- Per-bot **tailscale sidecar** (`tailscale/tailscale` image, `TS_AUTHKEY` = reusable auth key, hostname `botbox-<bot-slug>`); bot container `network_mode: container:<sidecar>` (documented Tailscale Docker pattern).
- **Bot-to-bot isolation:** each sidecar attaches to its own docker bridge network `botbox-net-<slug>` (nothing else on it besides botd's container listener via the gateway). Cross-bot traffic is isolated by network separation by default — asserted by an integration test (bot A cannot reach bot B's :6080/:9222 nor another bot's intervention route).
- Exit node on: sidecar runs `tailscale set --exit-node=<user-machine> --exit-node-allow-lan-access`; DNS must use MagicDNS (`--accept-dns=true`) or resolution breaks (verified caveat).
- **Exit node offline = traffic hard-fails (no auto-fallback, verified).** botd health-pings egress (`curl https://ifconfig.me` in-container, 60s interval when a turn is active); on failure pushes a banner to the app with one-click "pause bot" / "disable exit node for this bot."
- botd reaches container ports (5900/6080/9222/CLI) via the sidecar's docker-bridge IP; the app reaches noVNC via the sidecar's tailnet IP.

### 4.8 Bootstrap (`scripts/bootstrap.sh`) + get-a-box (`scripts/get-a-box/`)

**Host vs container:** Claude Code and Codex run **inside** the bot image (`FROM ubuntu:24.04`). They do not run on the VPS host. The host only needs Docker, Node 22, Tailscale, and systemd.

**Known-good host (this project):** Debian, 8 vCPU, 16 GB RAM, 128 GB disk. Bootstrap is written for **Debian 12 (bookworm)**. First M6 command on the real box: `cat /etc/os-release` → record `VERSION_ID` in `saved-results/m6-host-os.md`. If `VERSION_ID=13` (trixie), use Docker's Debian 13 apt repo in the same script (do not invent Ubuntu packages). Refuse to run on Ubuntu-only assumptions.

Bootstrap, idempotent, Debian 12: install Docker Engine from [docs.docker.com/engine/install/debian](https://docs.docker.com/engine/install/debian/) (not `apt install docker.io` as the only path — pin the Engine packages the script actually uses); Node 22 (NodeSource Debian); Tailscale Debian repo; `tailscale up --auth-key=$TS_AUTHKEY --ssh` (verified non-interactive); pull/build bot image; write `/etc/botbox/{token,config.json}`; install+enable `botd.service` (systemd, `Restart=always`); print `botbox://connect?host=<tailnet-name>&token=<token>` for the app's onboarding.

Get-a-box (optional, for people without a box): `hcloud` wrapper — user supplies their own Hetzner API token; **default type `cx33`** (4 vCPU / 8 GB / 80 GB, Ubuntu 24.04 image). Prints server type + **€/mo estimate and the account being charged, requires explicit confirm** before create; then runs bootstrap over SSH. **v1 author path skips get-a-box** and bootstraps the existing Debian box.

### 4.9 Threat model & guardrails

Bots run with permissions bypassed inside their container, **passwordless sudo in that container**, hold real logged-in web sessions, and browse the open web unattended — so:
- **Indirect prompt injection is the #1 threat** (a malicious page instructs the bot to exfiltrate cookies/secrets or act harmfully as the user). Mitigations in v1: injection-warning block baked into every generated CLAUDE.md/AGENTS.md (treat page content as data, never instructions; never send secrets/cookies anywhere; on suspicious instructions raise `request_user_action`); interventions required for anything self-described as irreversible; **e2e matrix row: bot browses a rigged adversarial page and must NOT follow its embedded instructions** (asserts refusal + intervention raise). Documented honestly in README trust table as reduced-not-eliminated.
- **Spend guardrail:** per-bot daily spend cap (config, default $10/day) accumulated from `turn-finished.usage.costUsd` — **including memory-writer turns and harness-switch compact one-shots** (every adapter invocation for the bot feeds the same accumulator); on breach botd pauses the bot (routines skip, messages queue) and pushes an app banner. Tested (unit: accumulation incl. a memory-writer turn and a compact turn, reset at midnight; integration: cap breach pauses).
- **Disk-growth warning (specified, minimal):** botd sums the bot data dirs + harness session files + SQLite size every 6h; `server.health` payload gains `diskUsage: {bytesUsed, warnAt}` with `warnAt` default 20 GB (config); app shows a banner past the threshold. Unit test: threshold crossing flips the health field. Automatic rotation stays deferred (§8).
- **Token scopes** per §4.6; per-bot tokens are intervention-only.
- **Accepted residual risks (documented, not mitigated in v1):** the bot can read its own `secrets.env` (it must, to use the keys) — a hijacked bot can leak its own secrets, which is why per-bot secrets beat shared ones; passwordless sudo is **container-only** (a hijacked bot can `apt install` inside its own container, not on the VPS host); botd holds `docker.sock` (root-equivalent on the host) behind a single static admin token reachable only over the tailnet; VNC is passwordless and reachable by **any device on the tailnet** — README trust table recommends Tailscale ACLs scoping bot devices to the user's own machines.

---

## 5. Testing strategy (tests written BEFORE implementation, every milestone)

Fixed order per milestone: restate observable "done" → write failing tests → run, show red assertion lines → minimum code to green → re-run, show counts. Coverage floor 80% incl. integration.

| Layer | Tooling | What |
|---|---|---|
| Unit | vitest | protocol schemas (valid/invalid fixtures); adapter JSONL parsers against **recorded fixture streams** (captured once from real CLIs, incl. malformed-line, mid-stream-crash, missing-session-id, **thinking/reasoning** cases); state machine transitions incl. queue-while-thinking and **idle→compacting→idle**; memory-writer + **compact-on-switch** prompt assembly; cron next-fire math; token auth middleware |
| Integration | vitest + testcontainers + dockerode | real Docker: create/start/stop/destroy bot pair, volumes persist across recreate, cgroup limits applied (`docker inspect` asserts), `docker exec` roundtrip; real SQLite store; **fake harness CLI** (stub binary emitting recorded JSONL with configurable delays/failures) driving the full conversation loop deterministically; intervention HTTP block/resolve cycle; routine fire → message appears in transcript |
| Live (gated `BOTBOX_LIVE_TESTS=1`) | vitest | real `claude -p` + real `codex exec` in-container: session create → resume ×3 → session id stable; memory writer writes files; MCP tools visible in `system/init` |
| E2E (consumer-realistic) | Playwright against Vite dev build of the app UI + **computer-use passes on the packaged Tauri app** | full flows below |

**E2E capability matrix (`e2e/MATRIX.md`)** — every row must pass via computer-use on the packaged app before M7 publish; rows: onboarding (paste connect URL → green health), create bot (name/role/harness → container appears), chat round-trip (ask bot to `touch /workspace/hello.txt` → file exists in container), live screen (open terminal via chat → window visible in sidebar stream), intervention (bot asked to log into a self-hosted test login page → card appears → take over → type creds → I'm done → bot confirms logged-in state), routine (1-min cron → message + reply in transcript), laptop-lid (start long task, quit app 5 min, reopen → progress continued), daemon restart (`systemctl restart botd` mid-idle → bots resume, transcript intact), exit-node egress (in-container `curl ifconfig.me` == home IP; disable → VPS IP), exit-node offline (stop Tailscale on Mac → banner within 90s), memory (tell bot a fact, force enough turns to compact or restart session → bot recalls via memory files), **harness switch compact** (idle bot on Claude Code with ≥1 turn → click Codex → divider `Compacted for Codex` appears; next user message is answered by Codex; Codex can state a fact from the compact; click Claude Code again → `Compacted for Claude Code`; Claude can state a fact from the Codex turns), **reasoning trace** (a turn that emits thinking + a bash tool → UI shows Thinking block + Bash row + assistant text, not a single blob), codex parity (chat + intervention rows re-run on a codex bot), **prompt-injection defense (bot browses a rigged page containing embedded malicious instructions → must not follow them; raises intervention instead — §4.9)**, **spend cap (set cap to $0.01 → next turn pauses bot + banner)**, **stop button (start a long task → Stop mid-turn → turn recorded interrupted, bot accepts next message)**.
Note: `tauri-driver` (WebDriver) does not support macOS ⚠️ (unverified from memory) — hence the split: Playwright drives the identical React UI via Vite dev server for CI, and the packaged-app rows run via computer-use (Claude driving screenshots+clicks) on the Mac, which is *also* the consumer-realism requirement.

---

## 6. Milestone map

M0 protocol+scaffold → M1 bot image → M2 botd core → M3 Claude adapter+loop+memory → M4 app → M5 codex+routines+egress → M6 bootstrap+hardening → M7 publish. Each has step detail in §7. Rough effort: M0 0.5d · M1 1–2d · M2 2d · M3 2–3d · M4 3–4d · M5 2d · M6 1.5d · M7 1d ≈ **13–16 focused days** (judge called the earlier 11-day figure optimistic; networking + e2e-matrix rows are the usual overrun points).

---

## 7. Step-by-step implementation guide

Conventions for the implementer agent: work in a git worktree per milestone; every step lists exact paths; run tests with `pnpm -r test`; never mark a milestone done without pasting failing-then-passing output; re-verify any ⚠️ fact before relying on it; **stop and ask before any step marked 💰**. §4/§5/§8 are the authoritative spec — where a milestone step list omits a test or artifact those sections require (e.g. dynamic-bind test, disk-warning unit test, Stop button, CONTRIBUTING.md version-bump section, trust-table ACL line), the §4/§5/§8 requirement still binds and belongs to the obvious milestone.

### M0 — Scaffold + protocol (done when: `pnpm -r test` green on protocol schema suite; CI runs it)

1. `git init botbox && cd botbox`; `pnpm init`; create `pnpm-workspace.yaml` (`packages/*`); root `tsconfig.base.json` (strict, ES2022, moduleResolution bundler); `.gitignore` (node_modules, dist, .env, *.local).
2. `packages/protocol`: `package.json` (deps: zod), `src/domain/bot.ts` (`BotConfig = {id, name, slug, harness, roleMd, memoryLimitMb?, cpus?, exitNodeEnabled, createdAt}`), `src/domain/harness-event.ts` (zod discriminated union `HarnessEvent` — the only definition; daemon `import type { HarnessEvent } from '@botbox/protocol'`), `src/domain/turn.ts` (`Turn = {id, seq: number, botId, role: 'user'|'assistant'|'system', harness?: 'claude-code'|'codex', source?: 'user'|'routine'|'harness-switch-compact', hidden?: boolean, parts: TurnPart[], createdAt}` where `seq` is unique per bot and strictly increasing; `TurnPart = {type:'text', id:string, text:string} | {type:'reasoning', id:string, text:string} | {type:'tool', id:string, name:string, inputSummary:string, outputSummary?:string, ok?:boolean} | {type:'compaction', forHarness:string}`), `src/domain/{intervention,routine}.ts`, `src/messages/` one file per WS message with zod schema + inferred type (incl. `bot-set-harness.ts`: request `{type:'bot.setHarness', botId, harness}`, response `{ok:true, harness} | {ok:false, error:'harness-switch-busy'|'compact-failed'|'inject-failed'|'spend-cap'}`; `event-stream.ts`: envelope `{id:number, botId:string, turnId:string, event: HarnessEvent}`), `src/index.ts` barrel.
3. Tests FIRST at `packages/protocol/test/schemas.test.ts`: for each schema ≥1 valid fixture parses, ≥2 invalid fixtures fail (wrong enum, missing field); round-trip type equality. Show red (schemas empty) → implement → green.
4. `.github/workflows/ci.yml`: pnpm install, typecheck, `pnpm -r test` on push/PR.

### M1 — Bot container image (done when: `docker run` of image shows XFCE in browser noVNC at :6080, Chrome CDP answers `curl :9222/json/version`, xdotool types into terminal, all via the M1 integration test)

1. Tests FIRST `packages/bot-image/test/image.test.ts` (vitest + testcontainers): builds image; container healthy; `GET :6080/vnc.html` 200; `GET :9222/json/version` returns Chromium; `docker exec … xdotool key Return` exit 0; `claude --version` and `codex --version` succeed; `/bot` + `/workspace` volumes writable as uid 1000; `docker exec -u bot … sudo -n true` exits 0; `docker exec -u bot … sudo -n whoami` prints `root`. Show red (no Dockerfile).
2. Write `packages/bot-image/Dockerfile`, `supervisord.conf`, `chrome-launcher.sh`, `mcp-server.js` placeholder — exact contents per §4.2.
3. XFCE panel config baked via `/etc/xdg/xfce4/` defaults (Chromium + terminal launchers).
4. `docker build -t botbox/bot:dev packages/bot-image` → run tests green.
5. Manual PoC (screenshot for later README): open `http://localhost:6080/vnc.html`, confirm desktop + dock; confirm `?view_only=true` blocks input.

### M2 — botd core (done when: WS client can create/list/delete a bot and the container pair actually appears/disappears in `docker ps`; store survives daemon restart)

1. Tests FIRST:
   - `daemon/test/store.test.ts`: SQLite CRUD for bots/turns/interventions/routines; migration idempotence; transcript append+page.
   - `daemon/test/containers.test.ts` (integration): `createBotPair(cfg)` → sidecar + bot containers exist with `network_mode container:`, labels `botbox.bot=<slug>`, default limits `--memory 4g --cpus 2` applied (`docker inspect` asserts); `destroyBotPair` removes containers, keeps volumes; recreate reuses volumes (marker file survives).
   - `daemon/test/api.test.ts`: WS auth (bad token rejected), `bot.create` happy path against a mocked container layer, zod rejection of malformed messages.
2. Implement `src/store/` (better-sqlite3, migrations dir), `src/containers/` (dockerode; sidecar env `TS_AUTHKEY`, `TS_HOSTNAME=botbox-<slug>`; per-bot network `botbox-net-<slug>` per §4.7), `src/api/` (fastify+ws admin listener :7777 + container listener :7778, token-scope middleware), `src/bots/registry.ts`. **Test topology matches production** (judge finding): the container suite runs the REAL sidecar pattern (`network_mode: container:<sidecar>`) with `TS_AUTHKEY` unset — tailscaled idles unauthenticated but the network namespace shape is production's; a "local mode" plain-bridge shortcut is allowed only for the pure-store tests. Add `containers-isolation.test.ts`: bot A cannot reach bot B's :6080/:9222; per-bot token rejected on admin listener and on bot B's interventions.
3. systemd unit file `packages/daemon/botd.service` + `config.json` loader (`/etc/botbox/config.json`: image tag, data dir, tailnet opts).
4. Red → implement → green; paste counts.

### M3 — Claude adapter + conversation loop + memory (done when: live-gated test creates a bot, sends 3 messages across 3 separate daemon processes, session id stable, memory file written after each turn, playwright+botbox MCP servers listed in `system/init`)

1. Capture fixtures: run real `claude -p "say hi" --output-format stream-json --verbose --include-partial-messages` once 💰(states account first; ~cents), save JSONL to `packages/daemon/test/fixtures/claude/`; also hand-craft `malformed.jsonl`, `crash-midstream.jsonl`, `error-result.jsonl`, **`thinking.jsonl`** (a `stream_event` wrapping `thinking_delta` / content_block `thinking` plus a later `assistant` text — even if the live capture has no thinking, this fixture is required). All daemon paths in this plan are under `packages/daemon/` (tests at `packages/daemon/test/...`).
2. Tests FIRST:
   - `adapters/claude-code/parser.test.ts`: fixture streams → exact expected `HarnessEvent[]`; `thinking.jsonl` → ≥1 `reasoning-text` then `assistant-text`; malformed line → non-fatal `error` event + stream continues; missing session id → fatal.
   - `adapters/claude-code/invocation.test.ts`: first-call vs resume argv construction (assert the exact §4.1 flag arrays incl. `--append-system-prompt-file`, `--mcp-config`, `--permission-mode bypassPermissions`; **no `--autocompact` flag — default auto-compact is relied on**, §4.1 is authoritative).
   - `bots/loop.test.ts` (fake-CLI integration): queue-while-thinking concatenation; retry×3 then error state; `turn-finished` triggers memory writer exactly once; intervention block suspends but does not fail the turn; **memory-writer serialization** — a message arriving during `memorizing` is not sent until the writer exec exits (no concurrent harness processes in one container).
   - `memory/writer.test.ts`: prompt assembly (transcript tail truncation at 8k, MEMORY.md included); writer argv (`--model claude-haiku-4-5`, `--allowedTools "Read,Write,Edit"`, cwd `/bot/memory`).
   - `memory/compact.test.ts`: argv is the §4.3 compact array (`--model claude-haiku-4-5`, `--allowedTools ""`, `--max-turns 1`, `--append-system-prompt-file /opt/botbox/compact-prompt.md`, no `--mcp-config`, no `--resume`); 32k truncation keeps the newest tail and prefixes `[earlier turns omitted]`; output is the `result` text.
   - `bots/transcript-reducer.test.ts`: two `reasoning-text` deltas with the same `partId` concatenate; two `tool-use` with different `callId` stay two rows; `tool-result` attaches to the matching `callId` not the other Bash; `compacted` appends a divider part.
   - `bots/harness-switch.test.ts` (fake-CLI): idle Claude→Codex runs compact once, calls `injectCompact` (not `send`), emits `compacted`, writes `activeHarness=codex` and both `lastInjectedSeq` keys, hidden inject turn is not in `chat.history`; second `setHarness` while compacting returns `harness-switch-busy`; compact failure / empty compact / inject `tool-use` / inject `error` / stream with no `turn-finished` / missing `turn-started` / duplicate `turn-started` / duplicate `turn-finished` / spend-cap leaves `activeHarness` as Claude and op `failed`; empty slice (switch with no new turns) flips harness and does **not** emit `compacted`; Codex→Claude slice is `seq > lastInjectedSeq['claude-code']`; **crash replay with session id**: op `injecting` + marker already in the fake destination log → `reconcileSwitchOps` does not call inject a second time, persists `sessions[to]`, commits `done`; **crash replay without session id**: `sessions[to]` missing, marker present in a scanned jsonl → recover id from that file, skip CLI, commit `done`; truncation keeps whole turns only.
3. Implement `src/adapters/claude-code/` (spawn via dockerode exec, line-buffered JSONL parse), `src/bots/loop.ts`, `src/bots/harness-switch.ts` (`switchHarness`, `reconcileSwitchOps`), `src/bots/transcript-reducer.ts` (`applyEvent`), `src/memory/writer.ts`, `src/memory/compact.ts` (`compactTranscript(ctx, text)`), `src/memory/compact-prompt.md`, `src/mcp/mcp-server.js` (real intervention tool: POST + long-poll `GET /interventions/:id/wait`), CLAUDE.md/AGENTS.md generation per §4.3. Copy `compact-prompt.md` into the image as `/opt/botbox/compact-prompt.md` (Dockerfile `COPY`). Boot path calls `reconcileSwitchOps()`.
4. Red → green on unit+fake-CLI suites.
5. 💰 Live suite (`BOTBOX_LIVE_TESTS=1`) — **stop: confirm which Anthropic key/account funds this** — then run: resume stability ×3 restarts, memory files appear, MCP servers in init event. After the capture, grep the live JSONL for `thinking_delta` / `"thinking"`: if present, save as `packages/daemon/test/fixtures/claude/live-thinking.jsonl` and add a parser test that it yields `reasoning-text`; if absent, write that fact into `saved-results/m3-resume-semantics.md` and keep the hand-crafted `thinking.jsonl` as the contract (do not block M3). The e2e **reasoning trace** row may use Codex if Claude live emits none.
6. ⚠️-verification step (two assumptions, §4.3): (a) does headless `claude -p` read `/workspace/CLAUDE.md` at all — probe: put marker in CLAUDE.md, ask fresh session for it; (b) does a resumed session pick up CHANGED CLAUDE.md after compact — script: seed session, rewrite marker, force many turns, ask for marker. Record both in `saved-results/m3-resume-semantics.md`; if either NO → enable the fallback (prepend `[memory updated]` note) and assert it in `loop.test.ts`.
7. ⚠️-verification: `@playwright/mcp` flag for attaching to existing CDP endpoint (expect `--cdp-endpoint http://localhost:9222`); check `npx @playwright/mcp --help`; record + pin version.

### M4 — Tauri app (done when: against a dev daemon with one bot, a human — and the Playwright suite — can chat, watch the screen, take over, resolve an intervention, all from the packaged app)

1. Scaffold `packages/app` with `pnpm create tauri-app` (React+TS+Vite template); shared protocol import.
2. Tests FIRST (Playwright against `vite dev` + a **mock daemon** (`packages/app/test/mock-daemon.ts` replaying protocol messages)): onboarding happy+bad-token; bot list renders; chat send/stream renders partial text; **part timeline** — mock streams `reasoning-text` (two deltas, same `partId`) then two `tool-use` with different `callId` then matching `tool-result`s then `assistant-text` → UI shows one Thinking `<details>` whose text is the concatenation, two named tool rows paired correctly, then the assistant text (not one concatenated blob); **two-bot stream** — envelopes for bot A and bot B interleaved with distinct `botId`/`turnId` attach to the correct transcripts; harness icons above composer are the files `packages/app/src/assets/harness/{claude-code,codex}.svg` whose path `d` sha256s match §4.3; Claude Code selected by default; click Codex while idle sends `bot.setHarness` and a `compacted` event renders the divider `Compacted for Codex`; click while thinking does not send; intervention card appears on push, Take-over swaps iframe URL `view_only=true→false`, Done sends `intervention.resolve`; exit-node-offline banner renders on `server.health` degraded; routines CRUD forms validate.
3. Implement views: `onboarding/` (paste connect URL → parse host+token → health check → Tauri secure storage), `chat/` (`PartTimeline.tsx` virtualized by turn, **harness icon row above the composer** — real marks per §4.3 — match the Grok Bot screenshot layout: chat left, screen+cards right), `screen/` (noVNC iframe, view_only toggle, reconnect logic), `routines/`. WS client with auto-reconnect+backoff in `src/daemon-client.ts`.
4. Dark mode + focus states per house style; keep component library minimal (no heavy UI kit; Tailwind).
5. Red → green Playwright; then `pnpm tauri build` and a first manual computer-use smoke pass of matrix rows 1–5 against the dev VPS 💰 (VPS + API costs — confirm accounts).

### M5 — Codex adapter + routines + real egress (done when: codex bot passes chat+intervention matrix rows; routine fires on schedule; in-container `curl ifconfig.me` returns home IP with exit node on, VPS IP with it off)

1. Fixtures from real `codex exec "say hi" --json` 💰; also capture or hand-craft `packages/daemon/test/fixtures/codex/reasoning.jsonl` (`item.completed` with type `reasoning` then `agent_message`). **Pin the reasoning text field name** from that fixture (`item.text` vs `item.reasoning` vs `item.content`) in the parser before merging. Tests mirror M3 (parser/invocation/loop reuse shared suites via adapter-conformance test harness: `packages/daemon/test/adapters/conformance.test.ts` runs the SAME assertions against both adapters' fake CLIs — this is what keeps the interface honest — incl. `reasoning-text` events, `injectCompact` argv, and compact-on-switch inject).
2. Implement `src/adapters/codex/`; bake `~/.codex/config.toml` (mcp_servers: playwright, botbox; `required=true`) into image; AGENTS.md generation already exists.
3. ⚠️-verification: Codex GitHub issue #15451 (`--json` silently ignored with MCP active) — run live probe; if broken, fallback: parse `--output-last-message` file + item events from stderr, and file upstream issue link in code comment.
4. Routines: `croner` scheduler in daemon + tests (`routines/scheduler.test.ts`: fake timers, DST edge, disabled skip) + app UI wiring.
5. Egress: enable real `TS_AUTHKEY` path 💰 (Tailscale free personal tier — confirm account); implement `bot.setExitNode` (runs `tailscale set --exit-node=…` in sidecar), egress health-ping + banner push; integration test on the dev VPS with the Mac as exit node; record IPs in `saved-results/m5-egress.md`.

### M6 — Bootstrap + hardening (done when: bootstrap on the known-good Debian host → onboarding URL works in the app first try; chaos tests pass)

1. Tests FIRST: `scripts/test/bootstrap.test.sh` (bats or plain sh) run inside a clean `debian:12` container with mocked `tailscale`/`docker` for arg assertions; idempotence = run twice, second run no-ops. Also assert the script **exits non-zero** on `ID=ubuntu` (wrong-OS guard) unless `BOTBOX_ALLOW_UBUNTU=1` (get-a-box path).
2. Write `bootstrap.sh` per §4.8. `get-a-box/` remains optional (Hetzner Ubuntu `cx33`) with the 💰 confirm gate; do not run it for the author box.
3. Chaos/hardening (scripted, on the Debian host): kill botd mid-turn → systemd restarts → bot state `thinking` recovers to `idle` with error turn recorded; **kill botd mid-OPEN-INTERVENTION → on restart the container-side long-poll reconnects (backoff per §4.4) and the same persisted intervention resolves normally; daemon reconciles orphaned harness execs on boot (scans running execs vs DB state, kills strays)**; **kill botd mid-compacting and mid-injecting → `reconcileSwitchOps` finishes or fails cleanly; destination session contains `marker=<op.id>` once; one compact divider; SQLite `activeHarness` matches `session.json`**; kill bot container mid-turn → daemon marks error, restart resumes session; disk-full on transcript write → error surfaced not silent; WS reconnect storm; spend-cap breach pauses bot.
4. Full e2e matrix run (all rows incl. laptop-lid, daemon-restart, exit-node-offline) via computer-use on the packaged app; check every row in `e2e/MATRIX.md` with date + evidence link.

### M7 — Publish (done when: public repo live, README renders correctly, ≥6 good-first-issues open, a stranger can clone→bootstrap from README alone)

1. Name check: GitHub/npm search for "botbox" collisions; if taken, shortlist alternates, ask user.
2. README per hindsight blueprint (facts appendix): banner (generate SVG), tagline, badges (license/CI/version/"works with Claude Code & Codex"), hook quote ("I asked my agent to run overnight and found it dead at 2am…"), demo GIF (record via the e2e computer-use pass), mermaid architecture diagram, Install (get-a-box + BYO paths), **trust table** (what runs where, what egresses via your IP, what's stored, hard limits), FAQ (cost/mo estimate, "can bots see each other?" → container isolation, "what if my Mac sleeps?" → exit-node behavior), How it's built (prose→filepath), Contributing, MIT.
3. Hygiene: `CONTRIBUTING.md` (dev setup, fake-CLI test loop, adapter-conformance suite as the contribution contract), `SECURITY.md`, `.github/ISSUE_TEMPLATE/{bug_report,feature_request}.md`, CI badge.
4. Good-first-issues (create via `gh issue create`, label `good first issue`, each with context+pointers): Cursor adapter (conformance suite makes this mechanical), Headscale support in bootstrap, routine run-history view, bot pause/archive, memory browser view in app, noVNC→Neko WebRTC upgrade spike, Windows/Linux app builds.
5. `gh repo create <name> --public` — **stop: confirm account + final name with user** — push, verify README render, protect main.

### 💰 Cost estimate (needs explicit OK before the first spending step, per money rule)
- Dev VPS: **existing Debian box** (8 vCPU / 16 GB / 128 GB). No Hetzner create unless the user asks. Optional get-a-box `cx33` remains in the script for other installers.
- Live harness tests + memory writer during dev: rough order $5–20 total API spend (Anthropic + OpenAI keys, accounts TBD at M3/M5 gates).
- Tailscale: free personal tier expected; confirm at M5.

---

## 8. Risks / open questions

1. **Prompt injection** — mitigated-not-eliminated (§4.9); the honest posture is guardrails + interventions + disclosure.
2. **Headless CLAUDE.md read + resumed-session memory refresh** (⚠️×2) — resolved empirically at M3 step 6; fallback specified.
3. **Exit-node coupling** — hard-fail verified; mitigated by health-ping + one-click disable (§4.7). Default: fail closed (identity consistency beats availability).
4. **Codex `--json`+MCP bug** (⚠️ issue #15451) — probe at M5 step 3; fallback specified.
5. **VNC latency/quality** — acceptable for supervision; Neko upgrade path noted as good-first-issue.
6. **Secrets readable by the bot itself** — accepted residual risk, per §4.9 (disclosure, per-bot scoping; password-manager integration deferred).
7. **`docker.sock` blast radius** — botd is root-equivalent on the host behind one static admin token on the tailnet; accepted for single-tenant v1, named in README trust table; token rotation = good-first-issue candidate.
8. **Unbounded disk growth for "forever" bots** — harness session JSONLs and SQLite transcripts grow without limit; v1 ships the specced `diskUsage` health warning (§4.9) + documented manual prune; automatic rotation deferred (noted in trust table).
9. **tauri-driver macOS gap** (⚠️ from memory) — e2e split (Playwright-on-Vite + computer-use-on-packaged-app) sidesteps it; re-verify at M4.
