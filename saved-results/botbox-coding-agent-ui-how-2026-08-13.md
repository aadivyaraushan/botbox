# Botbox as a coding-agent UI: how it works, and what the plan is silent on

**Date:** 2026-08-13
**What this is for:** A mental model of Botbox as a coding-agent product, plus an honest accounting of which invariants the plan already treats as binding and which it never mentions. Written so a senior engineer can hold the whole loop in their head and know where the holes are before implementation starts.
**Sources reconciled:** `planning/botbox-plan.md` (read in full, cited by line), `saved-results/coding-agent-ui-invariants-claude-codex-opencode-2026-08-13.md` (reference products), `saved-results/botbox-unique-architecture-invariants-2026-08-13.md` (Botbox-only invariants).
**Where explorers disagreed or were incomplete, the plan wins.** Two findings below come from re-reading the plan rather than from the explorer artifacts, and are marked as such.

---

## Overview

Botbox is not a coding-agent harness. It is a supervision shell wrapped around two existing harnesses (`claude` and `codex`), running them headless inside a Linux container that also has a real desktop and a real logged-in Chrome.

That one decision drives everything else. Because the harnesses run headless with permission prompts turned off (`--permission-mode bypassPermissions` for Claude at plan:174, `--sandbox danger-full-access --ask-for-approval never` for Codex at plan:175), the whole per-tool approval surface that Claude Code, Codex, and OpenCode build their UI around simply does not exist here. Botbox replaces it with three coarser things.

1. A container boundary plus passwordless sudo scoped to that container (plan:183, plan:278).
2. An agent-initiated escalation path (`request_user_action`, an MCP tool that blocks the turn until a human resolves it, plan:249).
3. Blunt kill switches (Stop, spend cap pause, disable exit node).

So the right way to read the plan is as a trade. Botbox gives up fine-grained veto power over individual tool calls and buys unattended overnight operation. The plan is strong on everything that trade creates (daemon owns the loop, exit-node identity, compact-on-switch, restart recovery, spend cap, prompt injection). It is thin on the ordinary chat-surface work that any coding-agent UI needs, and it has one structural gap that follows directly from the trade. There is no way for a user to say no to a specific action. The only refusal path is the bot voluntarily asking first.

The plan also has real coverage gaps in the wire protocol. The Stop message does not exist in the message list (plan:260) or the M0 protocol file list (plan:316), even though Stop behavior is specified elsewhere and has an end-to-end test row (plan:243, plan:298). And bot state (idle, thinking, waiting-intervention, memorizing, compacting) is defined only daemon-side (plan:192) with no message that carries it to the app, even though the app is required to react to it.

---

## Key Concepts

**Bot.** One container pair (Tailscale sidecar plus desktop container), one forever conversation per harness, `role.md`, a `memory/` directory written after every turn, plus optional routines. There is no concept of a run or a job (plan:47).

**Turn.** One user message (or routine tick) in, one harness process invocation, a stream of events out, then a memory write. A turn is the unit of billing, the unit of interruption, and the unit of ordering. `Turn.seq` is a per-bot integer assigned in the same write transaction, never a UUID (plan:199, plan:316).

**Part timeline.** The chat is not a blob of assistant text. Each turn holds an ordered list of parts (`reasoning`, `tool`, `text`, `compaction`) keyed by id, and the reducer is append-only (plan:151 to plan:161, plan:233 to plan:242). This mirrors OpenCode's `PART_MAPPING`.

**Intervention.** A blocked MCP tool call, not a UI pause. The bot calls `request_user_action`, the tool long-polls botd and does not return, so the harness turn stays in flight while a human does something on the bot's desktop (plan:249). The state `waiting-intervention` is a sub-state of `thinking` (plan:192).

**Exit node.** Bot traffic egresses through the user's home IP via a Tailscale exit node on the user's Mac. If that goes away, traffic hard-fails with no fallback to the VPS IP (plan:267, plan:268). Network identity is part of the turn's environment, not an ambient detail.

**Harness switch.** Swapping a bot from Claude Code to Codex is Botbox product logic, not a CLI feature. The plan compacts the visible transcript slice with a cheap one-shot model, then injects that summary into the destination harness with a durable marker so a crash mid-switch can be replayed safely (plan:197 to plan:230).

**Thin client.** The Tauri app owns nothing. botd on the VPS holds SQLite as source of truth, the Docker lifecycle, and the conversation loop (plan:78). Closing the laptop does not stop a turn.

---

## How It Works

### The shape

```
┌─────────────────── User's Mac ───────────────────┐
│  Tauri app (React/TS)          Tailscale client  │
│   chat (part timeline)          advertises       │
│   noVNC sidebar                 EXIT NODE        │
│   intervention cards            = home IP        │
└───────┬──────────────────────────────┬───────────┘
        │ WS :7777 (admin token)       │ WireGuard
        │ noVNC direct to tailnet IP   │ (bot egress)
        ▼                              │
┌─────────────────── VPS (Ubuntu) ─────┼───────────┐
│  botd (systemd, Restart=always)      │           │
│   SQLite = source of truth           │           │
│   loop · adapters · memory · cron    │           │
│   container listener :7778 ◄──┐      │           │
└───────┬───────────────────────┼──────┼───────────┘
        │ docker exec           │ POST + long-poll
        ▼                       │      │
┌─── bot container ─────────────┼──────┼───────────┐
│  claude / codex CLI (headless, prompts OFF)      │
│  botbox MCP ─ request_user_action ──┘            │
│  Playwright MCP ──► CDP :9222 ──► visible Chrome │
│  Xvfb :1 + XFCE + x11vnc + noVNC :6080 ──────────┼──► sidebar
│  /workspace  /bot(role, memory, state, secrets)  │
└──────────────────────────────────────────────────┘
```

### 1. Send

User types, app sends `chat.send` over the tailnet WebSocket (plan:260). botd creates the in-flight turn UUID before the first event, then invokes the CLI inside the container via `docker exec -u bot -w /workspace` (plan:164). First message on a harness creates a session, later ones add `--resume <id>` (plan:174). Stdout is parsed line by line as JSONL.

Note what is absent from the invocation. No approval flags, no sandbox restriction, no allow list. The bot can write any file, run any command, and `sudo apt-get install` inside its container without asking (plan:183).

### 2. Stream traces

The parser emits deltas only, never a full-snapshot replacement (plan:151). Each event goes two places. It is appended to the transcript via the reducer, and it is pushed to the app as `{id, botId, turnId, event}` (plan:242).

The UI mapping is fixed (plan:236 to plan:240). Reasoning becomes a collapsible block labelled Thinking while the turn is live, collapsed after. Tool use and tool result pair by id into one named row (`Bash · …`) that expands to show output. Assistant text becomes a markdown body. Reasoning tokens are explicitly first-class and must not be dropped.

The important sizing detail is that tool rows carry summaries, not full payloads. Codex `command_execution` gives `inputSummary` capped at 200 characters and `outputSummary` capped at 500 (plan:175). A file change arrives as a tool row named `file_change` with the same caps. There is no diff view anywhere in the plan.

### 3. Stop

The adapter interface has `interrupt(ctx): Promise<void>` (plan:135). The queue rule is specified. Interrupt does not discard queued messages, and after a Stop the queued messages arrive as the next turn prefixed `[previous turn was interrupted by the user]` (plan:243). There is an end-to-end matrix row for it (plan:298), and plan:311 explicitly says the Stop button binds even where a milestone step list forgets it.

What is missing is the wire. There is no `chat.stop` (or any stop verb) in the admin listener message list at plan:260, and no stop message file in the M0 protocol scaffold at plan:316. There is also no specified state transition for interrupt. The state machine at plan:192 covers `idle → thinking → memorizing → idle`, `idle → compacting → idle`, and `error`, but never says what happens to `thinking` when interrupt lands. This is the sharpest concrete hole in an otherwise very precise plan.

### 4. Queue

Messages arriving mid-turn queue FIFO and are concatenated into one message with `---` separators and source tags on the next send (plan:243). So the daemon side is right. Nothing silently drops.

The UI side is unspecified. There is no queue badge, no queued-message list, no edit-before-send, no Send-now. The M4 Playwright test list (plan:358) has no queue assertion. `chat.send` is not specified to return whether the message started a turn or joined a queue. A user who types three messages during a long turn currently has no way to know they were received. Reference products all solve this (Claude steers on Enter, Codex queues on Tab and injects on Enter, OpenCode has a follow-up dock with Send now and Edit).

### 5. Intervention plus VNC takeover

This is the best-specified part of the plan and it is the piece with no analogue in a local TUI.

```
bot calls request_user_action
        │  MCP tool POSTs botd :7778 (per-bot token), then long-polls
        │  GET /interventions/:id/wait  (30s cycles, retry + backoff, up to timeout)
        ▼
tool DOES NOT RETURN  →  harness turn stays in flight
        │                 state = waiting-intervention ⊂ thinking
        ▼
botd creates SQLite row, pushes card to app
        │
        ▼
user sees "Needs your attention" + live screen (noVNC, view_only=true)
        │
        ├─ Take over  →  same iframe, view_only off, human drives the desktop
        │
        └─ "I'm done" / "Skip"  →  intervention.resolve over WS
                                   tool returns {outcome: done|skipped|timeout}
                                   turn continues in place
```

Three consequences worth holding on to. The turn never restarts, so context is preserved through a human login. The intervention row is persisted, so a botd restart mid-intervention is survivable (the container-side poll reconnects and finds the same row, plan:249, chaos row at plan:375). And the outcome is fed back to the model, which satisfies the reference invariant that a deny or skip must reach the agent rather than deadlocking.

The gap is what the human and the agent do to each other during takeover. The sidebar starts view-only and Take over flips it to interactive (plan:251). But Playwright MCP is attached to that exact same Chrome over CDP :9222 (plan:80, plan:188). The plan never says whether the agent's browser automation is quiesced while a human is typing into the same window. During an intervention the agent is blocked inside the MCP tool call, so in the common case there is no contention. But the plan does not state that as a guarantee, does not cover a takeover the user initiates outside an intervention, and has no test for it.

### 6. Harness switch and compact

Switching is allowed only when idle and is rejected with `harness-switch-busy` otherwise (plan:193). The algorithm is worth knowing because it is unusual.

```
switchHarness(bot, to)
 1. txn: reject if state != idle or an op is compacting/injecting
         insert op {status: compacting, injectMarker: op.id, sliceThroughSeq: MAX(visible seq)}
 2. slice = visible turns where seq > lastInjectedSeq[to] and seq <= sliceThroughSeq
         EMPTY slice → flip harness only, no divider, no compact, no inject
 3. serialize slice to plain text, newest whole turns, cap 32k UTF-16 units
 4. compactTranscript() one-shot cheap model, never --resume, no tools
         fail the switch on empty / tool-use / spend cap / >8000 chars
 5. wrap with [harness-switch-compact marker=<op.id> from=… to=…]
 6. adapter.injectCompact (NOT send). Before calling, grep the destination
    harness session files for marker=<op.id>. Found → already done, skip CLI.
 7. one txn: insert visible compaction turn, set harness, set both
    lastInjectedSeq to sliceThroughSeq, op done, state idle, emit `compacted`
```

The marker grep is what makes a crash mid-switch recoverable. `reconcileSwitchOps()` runs at botd boot, replays `compacting` ops from the stored `sliceThroughSeq`, and replays `injecting` ops through the marker check so the destination session ends up containing the marker exactly once (plan:230).

**Finding not in the explorer artifacts.** The `compacted` event is emitted in exactly one place, `commitHarnessSwitch` at plan:227. Neither the Claude event mapping (plan:174) nor the Codex mapping (plan:175) maps any harness auto-compaction signal to `compacted`. But the plan relies on the harnesses' own auto-compact for long-running bots (plan:47, plan:343 says there is deliberately no `--autocompact` flag and default auto-compact is relied on). So the divider appears when the user switches harness, and does not appear when the thing that actually destroys context happens on its own. The reference artifact rates compaction visibility as loop-breaking at the context limit and supervision-breaking for awareness, with the specific failure being that users conclude the agent is broken when it forgets. Whether the CLIs even emit a detectable auto-compact marker in stream-json is not recorded anywhere in the plan, so this needs a probe before it can be called covered.

### 7. Reconnect

The app reconnects with `event.stream?after=<lastId>` and botd replays every envelope with a higher id for that connection's bots (plan:242). The reducer is append-only and keyed by `partId`/`callId` within `turnId`, and there is a two-bot interleaving test to prove events attach by `botId` plus `turnId` rather than session id (plan:242, plan:358). Transcript history comes from `chat.history`, which omits hidden turns so the injected compact handoff never shows up as a message.

**Finding not in the explorer artifacts.** The event stream carries `HarnessEvent` only. Bot state is not in it, and `BotConfig` at plan:316 has no state field. Yet the app is required to know state, because plan:192 says harness icons are disabled in every non-idle state and plan:358 tests that clicking an icon while thinking does not send. The plan describes intervention cards and banners as things botd "pushes to app" in prose (plan:62, plan:268, plan:280) but never adds those pushes to the message list at plan:260 or the M0 one-file-per-message list at plan:316. So idle versus running versus waiting-on-you, the reference artifact's third invariant and one it rates loop-breaking for the waiting case, is real in the daemon and undefined on the wire.

### 8. Exit node goes down

While a turn is active botd health-pings egress from inside the container every 60 seconds (`curl https://ifconfig.me`). On failure it pushes a banner offering one-click pause bot or disable exit node for this bot (plan:268). There is an end-to-end row requiring the banner within 90 seconds of stopping Tailscale on the Mac (plan:298). The posture is deliberate. Fail closed, because identity consistency beats availability (plan:397).

What is not specified is the in-turn experience. Egress dying does not make the CLI fail, it makes the agent's own network tools fail. From the model's point of view a `curl` or a Playwright navigation just returns an error, and it will probably retry or reason around it. The 3-retry exponential backoff at plan:192 is scoped to transient CLI failure, which this is not. So for up to 60 seconds, and then for as long as the user ignores the banner, a bot can keep burning turns against a broken network while believing the site is down. The plan has the detection and the escape hatch. It does not have a rule that pauses the turn or tells the agent what happened.

---

## Where Things Live

| Topic | Plan location |
|---|---|
| System diagram, message flow, intervention flow | §1, plan:9 to plan:65 |
| Binding decisions (thin client, brain on server, trace UI, harness switch) | §2 table, plan:71 to plan:97 |
| Adapter interface, `HarnessEvent`, reducer, per-CLI argv and event mapping | §4.1, plan:127 to plan:176 |
| Container image, passwordless sudo, Chrome CDP, supervisord, volumes, limits | §4.2, plan:178 to plan:188 |
| State machine, harness switch, compact-on-switch, trace UI table, queue, memory | §4.3, plan:190 to plan:245 |
| Interventions, MCP tool, noVNC sidebar, take over | §4.4, plan:247 to plan:251 |
| Routines | §4.5, plan:253 to plan:255 |
| WS message list, two listeners, two token scopes | §4.6, plan:257 to plan:261 |
| Tailscale sidecar, bot isolation, exit node hard-fail | §4.7, plan:263 to plan:269 |
| Bootstrap and get-a-box | §4.8, plan:271 to plan:274 |
| Threat model, prompt injection, spend cap, disk warning, residual risks | §4.9, plan:276 to plan:283 |
| Test layers and the end-to-end capability matrix | §5, plan:287 to plan:299 |
| Protocol scaffold (`Turn`, `TurnPart`, `BotConfig`, message files) | M0, plan:313 to plan:318 |
| App views and Playwright test list | M4, plan:355 to plan:361 |
| Chaos and restart-recovery rows | M6 step 3, plan:375 |
| Deferred items and good-first-issues | M7 step 4, plan:383; §8, plan:393 to plan:404 |

Two companion artifacts.

- `saved-results/coding-agent-ui-invariants-claude-codex-opencode-2026-08-13.md` holds the reference-product invariant table (15 numbered invariants with severity and evidence), the per-surface comparison of Claude Code, Codex, and OpenCode, and the list of URLs and OpenCode source paths used. Read it for the "what does a coding-agent UI have to do" bar.
- `saved-results/botbox-unique-architecture-invariants-2026-08-13.md` holds U1 to U17, the invariants that only exist because Botbox is remote, persistent, and networked through the user's home IP, each with a plan citation and a covered/partial status. Read it for the "what does this shape force on us" bar.

One correction to the plan while you are in there. plan:233 cites OpenCode's `PART_MAPPING` at `packages/ui/src/components/message-part.tsx` at commit `5d2dc888`. The reference-product artifact checked `dev` at `37fe5c83dc13` and found the file at `packages/session-ui/src/components/message-part.tsx`. The path in the plan is stale.

---

## Gotchas

### The bypass is the product, so half the reference UI does not apply

Botbox runs both harnesses with per-tool prompts off, on purpose, because a bot working overnight cannot wait on a human for every `Bash`. The reference artifact's own boundary section says this is legitimate. Skipping prompts is only loop-breaking for safety, not for completion, and it is acceptable when an enforced boundary remains (Claude `bypassPermissions` in an isolated container, Codex `never` plus `danger-full-access`). Botbox has that boundary. Container isolation, per-bot Docker network, sudo scoped to the container and not the VPS host (plan:183, plan:266, plan:283).

So these reference invariants are correctly not applicable.

- Per-tool approval prompt with once/session/always scopes. There is no ask path to build UI for.
- Approval UI showing action identity so the user can decide. Nothing is waiting on a decision.
- Protected-path prompts. Bypass mode is the whole point.

And these become **more** important precisely because the prompts are gone, not less.

- **Edits must be reviewable after the fact.** With no approval gate, the tool row is the only record that a file changed, and it carries a 200-character input summary and a 500-character output summary (plan:175). A 40-file refactor is not reviewable through that. The reference products all have a diff surface (Codex `/diff`, OpenCode inline diff and `session-diff`, Claude checkpoints plus editor). Botbox has none, and has no undo or checkpoint either. The bot works in `/workspace`, so git is the de facto answer, but the plan never says so and there is no UI for it.
- **Stop is the only veto.** Since the user cannot deny a specific action, Stop is not a convenience, it is the entire refusal mechanism. That makes the missing `chat.stop` wire message and the missing interrupt state transition disproportionately serious.
- **The escalation path is agent-initiated only.** `request_user_action` fires when the bot decides to ask, including under the injection-warning instruction to raise a card on suspicious page content (plan:279). A compromised or confused bot simply does not ask. The threat model says this honestly (mitigated, not eliminated, plan:395), and the rigged-page end-to-end row is the test (plan:298). Worth being clear-eyed that the primary anti-injection control is a prompt instruction to a model that has full file, shell, sudo, and logged-in-browser access.
- **Trust mode visibility is cheap here.** Reference products need a mode indicator because the mode changes. Botbox has exactly one mode forever, so a static line in the app plus the README trust table (plan:283, plan:381) covers it. Do not build a mode switcher.
- **Plan and read-only mode do not exist for users.** `--sandbox read-only` appears only inside `injectCompact` and `compactTranscript` (plan:175, plan:207). There is no user-facing plan mode, so the plan-then-approve workflow that all three reference products support is not available. That is a defensible scope call for an autonomous-bot product, but it should be a stated one.

### The bot is not watching, so nobody is watching

Everything about Botbox assumes the human is away. That inverts one reference assumption. A local TUI user is looking at the terminal, so cost, context pressure, and "it needs me" are all visible for free. Here they are not.

- Cost accounting is solid and includes invisible work. Memory-writer turns and harness-switch compacts feed the same daily accumulator (plan:280). But the only surface is a banner at breach. There is no ambient spend number and no context-remaining indicator anywhere in the chat chrome.
- Nothing notifies the user. An intervention can sit open for its full 60-minute timeout while the Tauri app is in the background and the user is in another app. No Mac notification, no dock badge, no menu-bar state. For a product whose central promise is "your bot needed you at 2am," this is the gap most likely to be felt first. It is silent in the plan.
- There is an internal inconsistency about pause. The exit-node banner offers one-click pause bot (plan:268) and spend-cap breach pauses the bot (plan:280), yet "bot pause/archive" is listed as a good-first-issue to be done by contributors later (plan:383). Pause is load-bearing in two shipped mechanisms and deferred as a feature. Pick one.

### Two Chrome realities, one browser

Playwright MCP attaches over CDP to the same visible Chrome the user watches in noVNC, on a non-default profile because Chrome 136 and later block CDP on the default one (plan:184, plan:188). This is a genuinely good design (the user sees exactly what the agent sees) and it is the source of the takeover race described above. Also note the attach flag itself is still unverified and scheduled for a probe at M3 step 7 (plan:353).

### Concurrency inside one container is a real constraint

Only one harness CLI process may run per bot at a time, because `~/.claude` and `~/.codex` are shared state. `memorizing` and `compacting` serialize against the main session and queued messages wait (plan:192). This is easy to violate later by accident, for example by adding a background summarizer or a second tool worker. Treat it as an invariant, not an implementation detail.

### Things the plan does not mention that are genuinely fine to skip

Named here so nobody mistakes silence for oversight. Slash commands, in-composer model picker (explicitly rejected at plan:196, one turn uses one harness), edit and regenerate a message, conversation branching or fork, transcript search, copy message, draft autosave, voice. None of these break the loop. The composer attachment path (images and `@` file mentions) is more debatable, because a bot that cannot be shown a screenshot is harder to unstick, but it is ergonomic rather than loop-breaking.

The one adjacent silence that is not fine is file movement between the Mac and `/workspace`. There is no upload and no download path in the plan. Getting a file to a bot or a result back currently means the agent fetching it over the network or a human typing into a VNC session.

---

## Plan coverage table

Kind is from the perspective of Botbox specifically. Loop-breaking means the agent loop or the user's ability to act cannot function without it. Supervision means the loop runs but the human cannot tell what happened. Botbox-unique means a local TUI never had to solve it.

| Invariant | Kind | Plan | Cite or "not in plan" |
|---|---|---|---|
| Turn blocks until a human decides, when a decision is needed | loop-breaking | covered, in the form Botbox chose (agent-initiated `request_user_action` blocks the turn via MCP long-poll; there is no per-tool ask path by design) | plan:58 to 65, 192, 249 |
| Stop aborts the in-flight turn, not just the spinner | loop-breaking | **partial** (adapter `interrupt()`, queue-survival rule, and an e2e row all exist; no WS message, no state transition, no behavior defined during an open intervention) | plan:135, 243, 298, 311; message list plan:260 and M0 list plan:316 have no stop verb |
| User can distinguish idle / running / waiting-on-you | loop-breaking (waiting) | **partial** (state machine exists daemon-side and the app is required to react to it; no state field on `BotConfig`, no state event, intervention and banner pushes described in prose only) | plan:192 covered; plan:316 and 260 silent; prose pushes plan:62, 268, 280 |
| Approval UI shows action identity | loop-breaking locally | not applicable (no ask path; the boundary is the container) | plan:174, 175, 278 |
| File edits are reviewable | supervision | **partial** (tool rows only, `inputSummary` 200 chars, `outputSummary` 500 chars; no diff view, no checkpoint, no undo) | plan:175, 236 to 240; no diff or checkpoint anywhere |
| Follow-ups while busy queue or steer, never silently drop | loop-breaking if dropped | **partial** (daemon queues FIFO and concatenates with `---`; interrupt does not discard; no queue UI, no badge, no edit-before-send, no send-now, `chat.send` return not specified, no M4 test) | plan:243 covered; plan:358 and 260 silent |
| Trust / permission mode visible and switchable | loop-breaking for plan flows | **partial** (mode is constant so nothing to switch; disclosed in README trust table and threat model, not in app chrome) | plan:278, 283, 381 |
| Plan / read-only mode prevents source edits until approved | loop-breaking for plan-then-edit | **silent** as a user mode (`read-only` sandbox is used only internally for compact and inject) | plan:175, 207; no user-facing mode |
| Compaction exists and is visible when history is replaced | loop-breaking at context limit; supervision for awareness | **partial** (compact-on-switch emits a visible divider with a test; in-harness auto-compact is relied on but no mapping emits `compacted`, so the ordinary case is invisible) | covered plan:197 to 230, 227, 240, 298; gap at plan:47, 174, 175, 343 |
| Session resume restores transcript continuity | loop-breaking for multi-day work | covered (per-harness session ids in SQLite plus `session.json`, never `--fork-session`, resume-across-3-daemon-processes live test, daemon-restart e2e row) | plan:47, 173, 338, 298 |
| Deny or skip feeds back to the agent rather than deadlocking | loop-breaking if it deadlocks | covered (`{outcome: done \| skipped \| timeout}` returns into the blocked tool call) | plan:249 |
| Images and `@` file mentions enter the turn context | ergonomic, supervision for visual bugs | **silent** (no composer attachments) | not in plan |
| Agent todo / checklist surfaces multi-step progress | supervision | **partial** (Codex `plan_update` and Claude `TodoWrite` render as generic tool rows; no dedicated dock) | plan:175, 238 |
| Cost and context indicators prevent silent burn | supervision | **partial** (per-bot daily cap accumulates all adapter invocations, pause plus banner on breach; no ambient cost display, no context-remaining indicator) | covered plan:280; no meter in plan:233 to 242 |
| Prompts may be skipped only if an enforced boundary remains | conditional loop-breaking | covered (container isolation, per-bot Docker network, sudo container-scoped, residual risks documented) | plan:183, 266, 278, 283 |
| U1 Daemon owns the loop; the app may vanish mid-turn | Botbox-unique, loop-breaking | covered (botd owns SoT, systemd `Restart=always`, laptop-lid e2e row) | plan:5, 78, 273, 298 |
| U2 Exit-node identity is part of the turn's environment; offline means hard fail | Botbox-unique, loop-breaking | covered for detection and escape hatch; **partial** for the in-turn failure surface (no rule pausing the turn or informing the agent; 3-retry rule is scoped to CLI failures, not egress) | covered plan:267, 268, 298, 397; gap at plan:192 |
| U3 Intervention blocks the harness turn in place and resolving unblocks the same turn | Botbox-unique, loop-breaking | covered (blocking MCP tool, long-poll with backoff, SQLite persistence, restart chaos row) | plan:58 to 65, 192, 249, 375 |
| U4 Human desktop takeover must not race the agent's browser automation | Botbox-unique, loop-breaking | **partial** (view-only default and Take over are specified; nothing says Playwright is quiesced, nothing covers takeover outside an intervention, no test) | plan:80, 188, 251 |
| U5 Playwright MCP attaches to the visible Chrome the user is watching | Botbox-unique, supervision | covered, with the attach flag still unverified | plan:80, 184, 188; probe at plan:353 |
| U6 At most one harness CLI process per bot container | Botbox-unique, loop-breaking | covered (`memorizing` and `compacting` serialize; queued messages wait; unit and loop tests) | plan:192, 344 |
| U7 Harness switch is compact plus inject with a durable marker, not cross-product resume | Botbox-unique, loop-breaking | covered in unusual depth (full algorithm, failure taxonomy, `reconcileSwitchOps`, marker idempotency, chaos row) | plan:197 to 230, 348, 375 |
| U8 Per-turn memory files outrank session JSONL for cross-restart and cross-harness recall | Botbox-unique, loop-breaking | covered, with two unverified assumptions and a specified fallback | plan:79, 244, 245; probes at plan:352 |
| U9 Routines inject messages with no client present and must respect pause and spend cap | Botbox-unique, loop-breaking | covered (croner, `source:'routine'` turns, spend-cap pause skips routines, e2e row) | plan:253 to 255, 280, 298 |
| U10 Thin-client reconnect catches up without duplicating or orphaning turns | Botbox-unique, loop-breaking | covered (`event.stream?after=<lastId>` replay, append-only reducer keyed within `turnId`, two-bot interleaving test) | plan:242, 358, 359 |
| U11 Multi-bot isolation; bot A cannot reach bot B's ports or interventions | Botbox-unique, supervision and safety | covered (per-bot bridge network, integration test, production-shaped test topology) | plan:266, 334 |
| U12 Passwordless sudo is container-scoped, not host-scoped | Botbox-unique, safety | covered (sudoers file, `visudo -c` in build, image test asserts `sudo -n whoami` is root, trust table states the blast radius) | plan:183, 278, 283, 322 |
| U13 Spend cap includes non-chat adapter invocations | Botbox-unique, supervision | covered (memory-writer, compact, and inject all feed one accumulator; unit and integration tests; e2e row) | plan:232, 280, 298 |
| U14 Disk growth from forever bots is observable | Botbox-unique, supervision | covered as a warning (6h sum, `diskUsage` in `server.health`, banner, unit test); automatic rotation deliberately deferred | plan:281, 402 |
| U15 Indirect prompt injection is the top threat because unattended Chrome holds real sessions | Botbox-unique, safety | covered as mitigated-not-eliminated (injection warning in generated CLAUDE.md and AGENTS.md, intervention required for irreversible acts, rigged-page e2e row, honest README posture) | plan:278, 279, 298, 395 |
| U16 Restart recovery for orphan execs, open interventions, and mid-switch ops | Botbox-unique, loop-breaking | covered (boot-time orphan-exec scan, `reconcileSwitchOps`, container-side long-poll reconnect, three chaos rows) | plan:230, 249, 375 |
| U17 Two listeners with two token scopes (admin versus per-bot intervention) | Botbox-unique, safety | covered (tailnet-only admin :7777, per-bot-gateway-only container :7778, dynamic binds, cross-bot token rejection tested) | plan:259 to 261, 334 |
| Notify the user when a bot needs them and the app is not focused | Botbox-unique, loop-breaking in practice | **silent** (no Mac notification, no badge, no menu-bar state; interventions can time out unseen after 60 minutes) | not in plan |
| Stop while an intervention is open | Botbox-unique, loop-breaking | **silent** (chaos covers botd restart mid-intervention; nothing covers interrupt against a blocked MCP call, and no cleanup rule for the orphaned long-poll) | not in plan; nearest is plan:249, 375 |
| Move files between the Mac and `/workspace` | Botbox-unique, ergonomic to supervision | **silent** (no upload, no download; only the network or a VNC session) | not in plan |
| Pause a bot as a first-class user action | Botbox-unique, supervision | **contradictory** (pause is used by the exit-node banner and by spend-cap breach, but "bot pause/archive" is deferred to a good-first-issue) | plan:268, 280 versus 383 |

---

## Inputs, Outputs, Algorithm (this document)

1. **Inputs.** `planning/botbox-plan.md` in full, the two saved-results explorer artifacts, and three targeted re-greps of the plan (`compact`/`auto-compact`, push/notify/attach/upload, and the protocol and message lists).
2. **Outputs.** A mental model of the user-visible loop, a section-to-topic index, the gotchas that follow from the permission bypass, and one coverage table with every loop-breaking and Botbox-unique invariant marked covered, partial, or silent with a citation.
3. **Algorithm.** Read the plan first so the explorer artifacts could be checked rather than trusted. Reconcile overlap (the trace UI appears in both artifacts; it is shared polish, not Botbox-unique). Re-derive the reference bar from the invariant table, then decide per row whether the permission bypass makes it inapplicable, unchanged, or more important. Verify the three claims the explorers left loose (Stop wire message, queue UI, auto-compact visibility) directly against plan lines. Report gaps by name.
