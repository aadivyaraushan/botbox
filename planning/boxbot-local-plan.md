# OpenBot — local team plan

**Importers/callers:** Implementers of `packages/daemon`, `packages/app`, `packages/protocol`; this file is the only canonical local-team plan. No runtime import.
**Affected API / schemas:** `AgentConfig` adds `model`, optional `effort`/`fast` (no `plan`); new `agent.setModel`, `agent.models`, `agent.compact`, `agent.clear`, `agent.setFast`, `agent.skills`, `agent.rename`, `terminal.read`, `terminal.run`, `terminal.create` (app-local); `TurnSource` adds `'clear'` and `'resume-continue'`; compaction + HarnessEvent `compacted` use `reason` `'harness-switch'|'manual'|'clear'`, optional `forHarness`, `compacted.partId`; live dividers via `turn-created` (+ optional `compacted`); `turn-created` requires `createdAt`; `turn-finished.usage` required with nullable `costUsd`; `AgentRuntime` gains `talkingToAgentId`/`contextUsed`/`contextWindow`/`sessionId`/`mcp`; banners keep `needs-login`/`disk-warn`, add `needs-site` and `memory-error` (no `peer-rate-limit`); Codex effort via `-c model_reasoning_effort=<effort>` plus `--strict-config`; tray unread + blocked-work attention IPC; macOS notifications when app not focused; `EventStreamMeta` bare WS push; **M0 keeps** `harness.completeLogin` (M1 Claude paste probe may delete it in the same PR if paste is unreachable).
**User instruction (verbatim):** “Documentation-only revision… Fix remaining judge blockers… User locked: appId `com.openbot.app`; after each ad-hoc rebuild re-grant Accessibility + Screen Recording (M2b + M7); do not try a stable ad-hoc identity.”

**Date:** 2026-08-13 (folded 2026-08-14; vision choices locked 2026-08-14; leftover calls folded 2026-08-14; leftover-fold judge REVISE pins folded 2026-08-14; capability-first fold homework folded 2026-08-14; packaging/login/hindsight judge blockers folded 2026-08-14; product renamed OpenBot 2026-08-14)
**Product rename (2026-08-14):** live product is **OpenBot** (`com.openbot.app`, `~/.openbot`, `@openbot/*`, `OPENBOT_*`, MCP `openbot`, `openbot-axclick`). GitHub URL and workspace folder unchanged. Remaining user choices: none except GitHub rename later.
  
**What:** A Mac workplace for lasting agents that live on this computer.  
**Why:** The old remote Linux desktop (VPS, Docker, noVNC, Tailscale) is extra complexity. The product is a **team you can see**, not a chat list and not a rented computer.  
**Supersedes:** `planning/botbox-plan.md` (remote-box path). Do not keep building that as the core.  
**Product lock:** `saved-results/boxbot-pivot-local-no-remote-2026-08-13.md`  
**Vision-fit fold:** `saved-results/boxbot-plan-vision-review-2026-08-14.md` — the 11 product choices are resolved; this plan is the locked outcome.  
**Leftover-calls fold:** `saved-results/boxbot-leftover-calls-2026-08-14.md` — login automation, Hindsight packaging, thin browser chrome, **capability-first** visible shell (MCP preferred, built-in fallback), Codex permission profiles, delete/resume/composer/notify pins, packaging milestone M2b.  
**Capability-first fold judgment:** `saved-results/boxbot-capability-first-fold-judgment-2026-08-14.md` — 10 homework blockers fixed in this revision (ad-hoc M2b; M7 on ad-hoc; no size cap).  
**Copy-from research (fetched 2026-08-13):**  
- ChatGPT/Codex browser: `saved-results/chatgpt-codex-builtin-browser-ux-2026-08-13.md`  
- AskUserQuestion + traces: `saved-results/botbox-askuserquestion-trace-ui-research-2026-08-13.md`  
- Grok Bot IA: `saved-results/grok-bot-ia-copy-vs-not-2026-08-13.md`  
- ChatGPT/Codex desktop commands, slash, terminal shortcuts (fetched 2026-08-14): `saved-results/chatgpt-codex-desktop-commands-2026-08-14.md`

A smart person who does not write code should be able to follow the diagrams and the “copy these” lists. **Skip §3.5 and §5** if you only want the why and the window; those two sections are the implementer’s recipe. An implementer follows the listed chrome: thin themed browser chrome over Electron `WebContentsView` (`Chrome.tsx`); if a behavior is listed below, copy it; if it is listed as **do not copy**, leave it out. Do **not** pin/fork an OSS browser-shell package.

---

## 1. The system at a glance

```
┌──────────────────────────── This Mac ─────────────────────────────┐
│                                                                   │
│  Menu bar icon  (app can hide; agents keep working)               │
│                                                                   │
│  ┌─ OpenBot app (Electron + Chromium) ──────────────────────────┐  │
│  │  Team list (home)     Agent world (click one agent)         │  │
│  │  - name + status      - thread with you                     │  │
│  │  - attention/unread   - AskUserQuestion / request_user_input│  │
│  │  - New agent          - Messaged B / Message from B         │  │
│  │                       - reasoning + tool rows               │  │
│  │                       - right pane: Browser / Terminal /     │  │
│  │                         Files tabs (several of each)        │  │
│  └───────────────┬─────────────────────────────────────────────┘  │
│                  │ ws://127.0.0.1:8799/?token=  (loopback only)   │
│  ┌───────────────▼─────────────────────────────────────────────┐  │
│  │  Local loop (packages/daemon)                               │  │
│  │  spawn Claude Code (Agent SDK) or Codex CLI per agent       │  │
│  │  pause / resume / stop / harness switch / spend display     │  │
│  │  spawn hindsight-api on loopback (one bank per agent)       │  │
│  └───────────────┬─────────────────────────────────────────────┘  │
│                  │                                                │
│  ~/.openbot/                                                       │
│    agents/<slug>/     MEMORY.md snapshot, files, workspace        │
│    private/<slug>/    thread, browser profile, codex-home         │
│    hindsight/         local Hindsight data + isolated Codex home  │
│    team.json          full AgentConfig list                       │
│                                                                   │
│  Claude Code / Codex log in via the Mac’s already-signed-in       │
│  Google Chrome (existing runbook). The in-app browser is          │
│  separate and is for agent web work.                              │
└───────────────────────────────────────────────────────────────────┘
```

**One agent =** a named lasting worker + a folder of files + live Hindsight memory (with a readable `MEMORY.md` snapshot) + a right-pane tab strip (Browser / Terminal / Files) + one thread with you + the ability to message other agents. No remote desktop. No “runs” that expire.

### Message flow

```
You type in agent A’s thread
    → local loop starts/resumes that harness
    → stream reasoning + tool rows into the thread
    → if the harness asks (AskUserQuestion / request_user_input) → option card
    → if A messages B → marker in A’s thread, full work in B’s thread
    → turn ends → Hindsight retain + rewrite MEMORY.md snapshot
```

### Right-pane flow (copy Codex tab strip)

```
Closed until you open a tab or the agent uses the browser / shell
    → + menu: Terminal / Browser / Files (several of each; no Review); every tab has a close control
    → Browser: agent drives frontmost tab; you watch; click inside the page takes control (pane shows You’re driving / Return control only here)
    → Terminal: you may type (cwd = that agent’s workspace/); agent shell commands also run in visible Terminal tabs (creating/running a tab does not steal focus; the trace tool row opens/focuses the matching tab)
    → Files: you open/read; Cmd+P search; read-only preview
```

---

## 2. Copy these (do not invent)

If a row says **copy**, the implementer matches that product. Sources fetched 2026-08-13.

### 2.1 Team and New agent — copy Grok Bot create-flow, not the messenger

| Copy | Exact behavior | Do not copy |
|---|---|---|
| New agent | Control labeled **New agent**. Shortcut **Cmd+N**. Name or describe, then start talking. No workflow builder. Grok Bot: sidebar **New** / **Cmd+N** → **Create new agent** / first-run **Create your own** (name, job, description). Docs: https://docs.x.ai/grok-bot/get-started , https://docs.x.ai/grok-bot/bots | Inbox as home. Group chats as the way agents meet. “Messaging a teammate” as the product pitch. |
| Home | Sidebar is the **team**: **name + status word + attention/unread dots** (not “who they’re talking to” on the row). Empty on first launch. | A chat-session list as the default. Default agents waiting. Composio onboarding agent. Sidebar row that shows “talking to X”. |
| Always on | Closing the window does not stop work. Menu bar icon stays. Quit or Pause stops. Grok Bot does this with a cloud computer; we do it locally. | Cloud VM. Shared cloud desktop for all agents. |

### 2.2 Thread chrome — copy Claude Code / Codex / OpenCode traces

| Copy | Exact behavior | Do not copy |
|---|---|---|
| Traces | Stream **reasoning** as one collapsible row **per reasoning part** (concatenate deltas with the same `partId`; a second thinking block after a tool is a second row). Each **tool** is its own row, paired by `callId`, showing the **tool name**, not a blob of JSON. Existing protocol already has `reasoning-text`, `tool-use`, `tool-result` in `packages/protocol/src/domain/harness-event.ts`. | Silent “thinking…”. One concatenated assistant blob. |
| Harness switcher | Sits **above the message box**. Real Claude Code and Codex logos, black and white. Click while **idle**, **paused**, or **error** sends `agent.setHarness`. Click while thinking / needs-you / memorizing / compacting: control **disabled**, tooltip “Wait until this turn finishes.” Switch **auto-compacts only if necessary** (non-empty uninjected slice) into the destination harness, shows a visible divider (`compacted` / `compaction` part, reason `harness-switch`), then **immediately continues the stopped work** on the destination harness (same Resume-continue behavior). Switching while paused **does not stay paused** — destination starts streaming. Compact/inject/continue may spend money because the user initiated the switch. Failure (`compact-failed` / `inject-failed`) rolls back to the old harness and previous paused/idle/error state. | Generic puzzle icons. Silent dead click. Switch that leaves the agent paused forever. |
| Send / Stop / Resume (one button) | The **send button is the only primary action** on the input bar (`data-testid="composer-primary"`). No separate Stop or Pause chips. Icon changes with state: **idle** / **error** → **send** (click / Enter → `chat.send`; disabled when the field is empty/whitespace); **thinking** / **needs-you** → **stop** (click → `agent.pause`, interrupt in-flight turn including an open ask card; agent ends `paused`; **Enter still works** and **queues** the typed message — it does **not** stop); **paused** → **resume** (click → `agent.resume`; does **not** send the draft; typed text stays; **Enter does not** `chat.send` and does **not** resume — show inline hint **Resume to send**). **Resume continues the stopped work** automatically: daemon starts a new streamed turn in the **same harness session** with no user text (source `'resume-continue'`), using persisted interrupted-turn context (§3.5). If a queue item already exists, Resume drains the queue instead of inventing a continue prompt. Turn finished / no turn → back to **send**. **memorizing** / **compacting**: keep the **stop** icon but **disabled**; **Enter still enqueues** via `chat.send` (Queued bubble) while primary stays disabled-stop (same idea as `chat.stop` while memorizing → `stopped:false`; do not treat Enter as send-to-start). Menu-bar **Pause all** / **Resume all** still call `agent.pause` / `agent.resume` per agent (Pause all protects open ask cards — §3.5). No extra per-agent Pause chip when idle — idle is Send. Show spend on this bar. **No automatic spend cut-off.** Tests: `packages/app/e2e/app.spec.ts`. | Separate Stop and Pause buttons. Hidden cost. Auto-kill at a dollar cap. Resume that only flips idle with no work. Enter-while-paused that sends. |
| Interrupted / error | After the last part of that assistant turn: `outcome:'interrupted'` shows a muted one-line row **Stopped.** `outcome:'error'` shows **Something went wrong.** and, if `errorMessage` is non-empty, that string on the next line in `--mono`. Do not show `errorCode`. | Silent fail. Toast. |
| Composer / input bar | At the **bottom** of the thread column (`data-testid="composer"`). Holds model picker ◎ context donut, spend chip, and the one primary button (`composer-primary` — Send / Stop / Resume), then the message field. Text field stays **enabled** while `paused`, `thinking`, `needs-you`, `memorizing`, and `compacting` (so they can type or queue). Primary while thinking / needs-you is **Stop** (not Send). Primary while memorizing / compacting is **disabled-stop**. **Enter** while primary is Send → `chat.send`. **Enter** while primary is Stop (turn running or open ask card, and **not** in Answer-in-chat mode) → enqueue via `chat.send` (Queued bubble); primary stays Stop. **Enter** while memorizing / compacting → enqueue Queued; primary stays disabled-stop. **Enter** while paused → do **not** `chat.send`; show inline hint **Resume to send**. **Shift+Enter** always newline. After **Answer in chat instead**, the composer is in answer mode: Enter / send maps to `ask.answer` with `response` (not a queue item). Placeholder `Message {name}`. Harness switcher stays **above** this bar (already locked). Model / donut / spend do **not** appear in a top agent header, window title bar, or toolbar above the thread. | Ctrl+Enter to send. Empty placeholder. Separate Stop/Pause controls. Controls in an agent header. Disabled field while a turn runs. Enter-while-paused that sends. |
| Reasoning row | **Expanded while streaming**; **collapsed** when the turn finishes. Collapsed summary = first 80 characters of the reasoning text, or `Thought` if empty. Click toggles. | Always expanded. No summary. |
| Stick to bottom | While a turn is streaming, keep the thread scrolled to the latest part. If the user scrolls up more than 80px, release. Show a chip **Jump to latest** that re-sticks and hides itself. | Force-scroll even after the user moved. |
| Tool row | Closed: tool **name** plus `inputSummary`. Expand (click) shows `outputSummary`. | Dump JSON. Output always visible. |

### 2.3 Asking you — copy Claude Code AskUserQuestion

Official schema: https://code.claude.com/docs/en/agent-sdk/user-input (fetched 2026-08-13).

**Wire the real tool** for Claude Code via Agent SDK `canUseTool` when `toolName === "AskUserQuestion"`. On **main turns, do not pass a `tools` array** — the SDK default set includes `AskUserQuestion` (docs: TypeScript `Options.tools`, fetched 2026-08-13). Only the compact one-shot restricts tools, via the SDK `tools` array (not `allowedTools`, which does not restrict): compact `tools: []` (empty means no tools — if the compact init message still lists tools, **stop and revise**). Memory is Hindsight retain+snapshot (no harness writer tools array). Do not fake cards from prose.

Each call: **1–4 questions**. Each question:

- `question` — full text, shown on the card  
- `header` — chip, max 12 characters  
- `options` — **2–4** of `{ label` (1–5 words), `description` }  
- `multiSelect` — if true, several options. Field is optional; omit or `false` means single-select.

One card renders **all** questions in the call, stacked in order. A single-select question commits its answer on click (highlight stays; card stays `open` until every question has an answer). A multi-select question toggles labels; that question shows a **Done** control. `ask.answer` is sent **once**, when every question has an answer (or the user uses Other / **Answer in chat instead** on the card as a whole). `answers` has one key per question. Partial cards stay `open`.

Host UI always adds **Other** (free text) per question, plus one **card-level** **Answer in chat instead** (not per question). Return the typed Other text, not the word `"Other"`. An `answered` card shows each question with its chosen label, or the typed text in `--mono` when the answer came from Other (`answers[question]`) or **Answer in chat instead** (`response`). Clicking **Answer in chat instead** closes the live card UI into answered-pending-chat mode and **enables composer submission as the answer path**: the next Enter / primary-send becomes `ask.answer` with `response` set to that text (and `answers` empty). That sets part `status:'answered'` and stores `response` on the part (add optional `response?: string` next to `answers`). While the card is still **open** (neither Other nor **Answer in chat instead**), Enter / send **queues** the typed message (daemon queue in §5.2) — it does not answer the card; primary stays Stop.

Return to the SDK (full shape including optional `response` is §5.3):

```
{ behavior: "allow", updatedInput: { questions, answers } }
```

`answers` keys are the **question text**; values are the selected **label**(s).

**Codex ask cards (locked, revised 2026-08-14 M1b probe):** enable `default_mode_request_user_input = true` in that agent’s `~/.openbot/private/<slug>/codex-home/config.toml` `[features]` (full file in §3.5). **Main Codex turns use `codex app-server --strict-config` JSON-RPC**, not `codex exec --json`, because Codex CLI **0.147.0** rejects `request_user_input` in exec mode (`request_user_input is not supported in exec mode`) and treats piped stdin as the prompt. Probe evidence: `packages/daemon/test/fixtures/codex/probe2-REVISE-TO-APP-SERVER.md`, `request-user-input.jsonl`, `request-user-input-answer.jsonl`. Map `item/tool/requestUserInput` onto the same `ask-user-question` parts / `AskCard.tsx`. On `ask.answer`, send a JSON-RPC **response** to the pending request id: `{ "jsonrpc":"2.0", "id": <id>, "result": { "answers": { "<questionId>": { "answers": ["<label>"] } } } }` (exact bytes in the answer fixture). Do **not** fall back to prose. Do **not** answer asks via child stdin.

`(Recommended)` on the first option is **product chrome** (Claude Code UI does this; it is not in the official schema). Still show it when the model puts it in the label.

Agents should use these cards **a lot** when they need a decision — not a wall of text.

### 2.4 Right pane — copy Codex tab strip (Browser / Terminal / Files)

Sources: https://learn.chatgpt.com/docs/browser.md , https://learn.chatgpt.com/docs/integrated-terminal.md , shortcuts in `saved-results/chatgpt-codex-desktop-commands-2026-08-14.md` (fetched 2026-08-14). Full browser brief: `saved-results/chatgpt-codex-builtin-browser-ux-2026-08-13.md`.

**Layout:** team | thread + composer | **right tab strip**. Per agent. Closed until you open a tab or the agent uses the browser. Tab **types:** Browser, Terminal, Files. **Multiple of each.** `+` menu lists Terminal / Browser / Files. **M2:** Browser, Terminal, and Files entries exist but are **disabled** with tooltip **Coming in a later build** until M5 (Browser + Terminal) / M6 (Files) enable them. Hidden-window browser ops still work from the daemon in M5+; M2 does not ship a usable Browser tab body. **Review is out of v1** — do not ship an empty Review tab. **Ctrl+Shift+G** stays out. **Cmd+N** stays **New agent**.

| Copy | Exact behavior |
|---|---|
| Browser what | A **browser**, not a full desktop. Shared view: you see what they see. Agent drives the **frontmost** browser tab. Agent **can open its own browser tabs** (those come to the front). |
| Browser open | Toolbar, **click a URL** in the thread, navigate in the pane, `+` → Browser, or **Cmd+Shift+B** (documented; do **not** replace with ⌘T). |
| Engine | Built-in Chromium tab inside the app (not Google Chrome, not Safari). Each browser tab is its own Electron `WebContentsView`; cookies live in that agent’s private profile folder. **Thin themed chrome** in `packages/app/src/renderer/browser/Chrome.tsx` (URL bar, back/forward/reload, You’re driving / Return control) — **implemented in M5** (M2a is contract-only). Theme to ChatGPT desktop / Codex tokens (§6). Do **not** pin/fork `electron-browser-shell`, Reframe, or `electron-as-browser`. Exact Electron view types and APIs: §3.5 / §8. |
| Profile | **Separate** from Google Chrome. Sign in **inside this pane**. Credentials never typed into chat. |
| Address bar | Suggest from **this browser’s history**; otherwise search **Google**. |
| Browser tabs | **Several** browser tabs per agent. Only the frontmost tab is visible in the pane; the others stay ready off-screen. A page that wants a new window becomes a **new tab** instead (no second OS window). Exact view wiring: §3.5. |
| Downloads | System Downloads folder by default. |
| Permissions | Ask before a **new site** unless already in `browser-allow.json` (banner `needs-site`). Extra ask before submit / purchase is **out of v1**. |
| Drive vs take over | Agent clicks/types/screenshots. **Take over exists only on the browser pane.** A click inside the page automatically takes control. Pane chrome shows **You’re driving** and **Return control** (no thread marker, no team-row takeover state). **Return control** clears `humanControl.held` and unblocks agent browser tools. Agent must not automate file uploads. |
| Terminal | Visible per-agent Terminal tabs. **You may type** (starts in that agent’s `workspace/` folder). **Capability first, visibility second** (§3.5 Visible shell): prefer main-agent shell in a visible Terminal tab via MCP (`shell_run` / Claude `toolAliases: { Bash: 'mcp__openbot__shell_run' }`; Codex `[features] shell_tool = false` + MCP). If that path is missing or the probe fails, **keep built-in Claude Bash and Codex `command_execution`** — never disable a real harness capability just because we cannot show it in our UI. Creating or running in a tab **must not steal focus**; the coding-agent **trace still shows a named tool row** that opens/focuses the matching tab when clicked (`terminal.focus`). Agents may **read** Terminal output via `terminal_read` (most recently written → then last-focused; `no-terminal` only when no tabs). Nested Agent private shell is allowed. Write-deny still applies (§3.5). Shortcut **Ctrl+`**. Clear **Ctrl+L**. **Cmd+K** opens the command palette when implemented; if not shipped, omit — it does **not** clear. Packages and IPC: §3.5 / M5. |
| Files | Viewer you open/read; not a second Finder; not driven. **Cmd+P** opens/search files (Codex changelog: command-menu file search). Preview still read-only. Keep `agent.files` / `agent.readFile`. |
| Local pages | Browser can open `http://localhost:...` so a coding agent can preview an app. |

**Do not copy:** Atlas (deprecated). ChatGPT **cloud browser**. Chrome extension / `@Chrome` as the default. Grok Bot’s full **Agent Computer** Linux desktop. An empty Review tab.

### 2.5 Agent-to-agent — copy the screenshot markers, not Grok Bot group chat

| Copy | Exact behavior |
|---|---|
| Markers | In A’s thread, centered: **Messaged [icon] B**. Later: **Message from [icon] B**. A keeps talking to you (summary + cards). |
| Watch B | Open **B’s thread** to see what A sent and what B actually does. |
| No third chat | No A–B room in the sidebar. You always talk to the agent whose thread is open. You do not join as a third speaker. |
| Files | A **may read** B’s folder. A **must not write** B’s folder. A writes in A’s folder. Live memory is **Hindsight** (one bank per agent); `MEMORY.md` is a generated snapshot other agents can still open as a file. |

Grok Bot **Bot↔Bot DMs** and **group chats of 2–6 bots** are **out**.

### 2.6 Login (harness) — already standing

Claude Code / Codex **account login**, not API keys. When `needs-login`: follow `e2e/computer-use/harness-login.md` (Mac Google Chrome, already signed in). OpenBot requests Accessibility + Screen Recording (+ Apple Events for Chrome) and **clicks Allow itself** via AX + CGEvent helper `openbot-axclick` (no `cliclick`). **M2b** ships an **ad-hoc / locally signed** build for Allow-click E2E (not App Sandbox / not Mac App Store). Bundle id / `appId`: **`com.openbot.app`**. After **each** ad-hoc rebuild, M2b verify and M7 **must re-grant** Accessibility and Screen Recording (macOS treats a new ad-hoc binary as a new identity — **do not** try a stable ad-hoc identity). **Developer-ID + notarize** is a documented follow-on after M2b — not an M2b blocker. Full recipe §3.5 / §5.5.7. Do not ask the user to Take over and type CLI commands. Do not copy `~/.claude/.credentials.json` or a Chrome profile unless asked.

The **in-app browser** is a different profile. Harness login stays in Google Chrome.

### 2.7 App shell analog

ChatGPT desktop, Codex, Grok Bot, and OpenMausBot are **Chromium desktop apps**. OpenMausBot: Electron, spawn `claude`/`codex` on the Mac, data in `~/.openmausbot`.

**This plan:** Electron Mac app + local loop on `127.0.0.1:8799` + data in `~/.openbot`. Not Tauri (old remote-viewer plan). Not a browser tab.

---

## 3. What we are not building

- Remote VPS, Docker `ubuntu:24.04` desktops, noVNC, Tailscale exit node, takeover of a Linux box  
- Messenger clone (Grok Bot / OpenMausBot inbox as home)  
- OpenClaw channel gateway  
- Composio as onboarding  
- A browser engine written here  
- Phone OS / App Store / always-on cloud VM  

Keep from the old repo only what still matches: `packages/protocol` shapes for harness stream, pause/resume/stop, harness switch, login banners — **after** stripping remote-only fields (`exitNodeEnabled`, `bot.setExitNode`, `exit-node-offline`, noVNC human-control). Human-control becomes **in-app browser take over**, not a VNC lease.

**Three product calls (plain language; the recipe is in §3.5):** there is **no** “allow this command?” prompt — lasting agents keep working after the window closes. **Both** Claude and Codex agents may work elsewhere on the Mac; an agent folder is **context, not a cage**. Both harnesses must **deny writes** to other agents’ folders and to OpenBot private/system paths (`~/.openbot/private/`, `team.json`, `login-url`, credential dirs) while allowing other Mac work. If the pinned Codex CLI rejects the permission-profile keys, **stop and revise** (do not fall back to `writable_roots=["homeDir"]` or own-folder-only). **Quit** while an agent is waiting on a card shows a dialog with **Open OpenBot** or **Stop and quit**; closing the window is not Quit.

---

## 3.5 Mechanisms (locked — do not invent)

Plain language: this section is how the window talks to the always-running background program, how one agent hands work to another, how we stop an agent from editing someone else’s files, and how the in-app browser is driven. An implementer still follows the exact bullets; they do not invent a second path.

### Transport (app ↔ daemon)

Framing is defined in this section (do **not** read `planning/botbox-plan.md` §4.6.0 — that document is superseded and disagrees). Loopback bind only:

- Daemon binds **only** host `127.0.0.1`. Port = `Number(process.env.OPENBOT_PORT ?? 8799)` (tests may set `OPENBOT_PORT=0`). One process, one listen. Default URLs use that port (examples below assume 8799):
  - App WebSocket: `ws://127.0.0.1:${OPENBOT_PORT}/?token=<admin-token>`
  - Harness MCP (HTTP, Streamable HTTP): `http://127.0.0.1:${OPENBOT_PORT}/mcp/<agentId>?token=<mcp-token-for-that-agent>`
- **Admin token (WebSocket only):** the **app** generates it at first launch (32 random bytes, hex). If `safeStorage.isEncryptionAvailable()` is true, encrypt with `safeStorage.encryptString` and write the ciphertext to `app.getPath('userData')/admin-token.bin`. If it is **false**, write the hex token **plaintext** to that same path with mode `0600`. On launch, decrypt or read plaintext accordingly. Pass `OPENBOT_ADMIN_TOKEN` in the daemon child environment. The daemon holds it in **memory only**. No token on the socket → close. **Never** put this token in an agent folder or in `config.toml`.
- **MCP tokens (per agent):** in **daemon memory only** (`Map<agentId, token>`). On `agent.create` **and on every daemon start**, generate a fresh 32-byte hex token per agent. **Do not write** `~/.openbot/mcp-tokens.json` (delete that path from the tree). `/mcp/<agentId>` accepts **only** that agent’s current token. Ada’s token on Bea’s path → 401. The admin token on `/mcp/` → 401. `agent.delete` drops the memory key. Claude gets the url (with token) only via Agent SDK `query()` `mcpServers.openbot` — **not** a shared `settings.json`. Codex: write the url into **that agent’s** `private/<slug>/codex-home/config.toml` only, on every spawn. `codex.test.ts`: Ada’s `config.toml` does not contain Bea’s token; no file under `OPENBOT_HOME` except `private/<slug>/codex-home/config.toml` contains that slug’s token. **Known:** with permission profiles, other-agent dirs are `"read"` (not write); private/credential paths are `"deny"` including read. Do not put every token in one file.
- **E2E seam:** when `process.env.OPENBOT_DAEMON_WS` is set, the app **does not** spawn a daemon child and **does not** read/write `admin-token.bin`. Connect to `OPENBOT_DAEMON_WS` **exactly as given**; do not add or rewrite `token` (the Playwright URL already has `?token=test-token&scenario=…`). Production launches never set this.
- **M1 (no app):** the developer exports `OPENBOT_ADMIN_TOKEN` (any 64-hex string). `pnpm --filter @openbot/daemon start`, `scripts/dev/login.mjs`, and `packages/daemon/scripts/smoke.mjs` all read that env var and exit `1` with `OPENBOT_ADMIN_TOKEN is unset` if missing. `login.mjs` **never** reads `admin-token.bin`.
- **Framing** is **not** in `packages/protocol` (payload schemas only). It lives in `packages/daemon/src/wire/framing.ts`. The app and `packages/app/e2e/fake-daemon.ts` import it (`@openbot/daemon/wire` export). One WebSocket **text** frame = one JSON object (no length prefix; `ws` already frames). Signatures:

```
export function encodeFrame(obj: unknown): string  // JSON.stringify
export function decodeFrame(raw: string): { ok:true, value: unknown } | { ok:false, id: string | null }
```

`decodeFrame`: JSON.parse; on throw return `{ ok:false, id: null }` (caller logs `[api] invalid-request-no-id` and **sends nothing**). On success, caller Zod-validates `value`. Zod fail with a string `id` → reply `{id, type:'response', ok:false, error:'invalid-request'}`. Requests in **both** directions carry `id` (UUID) plus their own `type`. Every **reply** is `{id, type:'response', ok:true, ...} | {id, type:'response', ok:false, error:string}`. Stream envelopes and banners are pushes: **no** request `id`.
- **Live stream replay:** one socket carries every agent. `StreamEnvelope.id` is a **single global** counter starting at 1 when the daemon starts (not per-agent; not a UUID). The daemon keeps an in-memory ring of the last **10_000** envelopes **overall**. App `event.stream { after? }` asks for envelopes with `id > after`. If `after` is omitted, replay the **whole** ring. On connect, replay those. If `after` is older than the oldest retained envelope, **or greater than the current maximum id**, or the ring was dropped on daemon restart, push a **bare** WS text frame `{ type:'event.stream.meta', replayReset: true }` (`EventStreamMetaSchema` — not a `StreamEnvelope` channel) and do **not** replay; the app then calls `chat.history` + `agent.get` for **every** agent in `agent.list` and restores banners from `agent.get` / `agent.list` `banners`. **Selecting an agent:** the first time this app session selects an agent, call `chat.history { agentId }` and render those turns **before** applying live envelopes for it. Later envelopes whose `turnId` is already on screen **update** that turn by calling `applyEvent` from `@openbot/daemon/turns` on that turn’s `parts` (do **not** write a second fold in the app); they do not append a second row. The **WebSocket client lives in the Electron main process** (only main can run `browser.exec` / `terminal.run` and close views). Renderer talks to main via preload **`daemon.request`** / **`daemon.onEvent`** (exact names — do not invent a second IPC pair).
- **Pause all** (menu bar): before pausing, if any agent has an `open` ask card, show the same protective modal as Quit (title **An agent is waiting on you**; list waiting names). Buttons: **Open OpenBot** (default — show window, select first waiter) and **Pause the others** (pause every agent that does **not** have an open card; leave waiters alone). If no open cards, pause every agent. **Resume all:** `agent.list`, then `agent.resume` for each agent whose state is `paused`. No separate protocol messages.
- **`agent-runtime` push:** whenever that agent’s `state`, `queueCount`, `spendUsdToday`, `talkingToAgentId`, `contextUsed`, `contextWindow`, `harnessAuth`, or `humanControl` changes, push `DaemonEvent` `kind:'agent-runtime'` with the full `AgentRuntime`. Emitting an `ask-user-question` part sets `state` to `needs-you`. `ask.answer` sets it back to `thinking`. Composer **stop** icon (and menu-bar Pause) from `needs-you` / `thinking` send `agent.pause` → ends at `paused` (interrupted → writer → paused). `chat.stop` remains on the protocol for scripted clients; the app input bar does not expose a separate Stop that calls it.

### How A messages B (model tool)

Do **not** use Anthropic’s Agent/subagent tool for peer work (`AskUserQuestion` is unavailable there).

The daemon hosts **one** MCP HTTP server on the **same** `127.0.0.1:8799` bind (not a second port, not an in-process SDK server). Each harness process connects to `http://127.0.0.1:8799/mcp/<its-agentId>?token=<its-mcp-token>`. The path segment **is** the caller; the token must match that id. `list_agents` omits that id. `message_agent` sender is that id. `browser.exec` `agentId` must equal the path or the tool returns `wrong-agent`.

Tools (M1) — register with `@modelcontextprotocol/sdk` `server.tool` (exact `description` strings and raw Zod shapes in §5.5.6):

- `list_agents` → `{ id, name, slug }[]` (everyone except self)
- `message_agent` `{ toAgentId, text }` → daemon `peer.send`

M1 builds this HTTP server even with one agent, and **implements** `peer.send` (delivery in §3.5). M4 is the **app** markers only. M1b points Codex at the same URLs. `browser_*` is registered on this same server in M5.

**MCP HTTP wiring** (`packages/daemon/src/mcp/http.ts`, SDK 1.30.0 `StreamableHTTPServerTransport`):

1. Token and path **first**. Parse `/mcp/:agentId` and `?token=`. Unknown id or token ≠ `Map.get(agentId)` → `res.writeHead(401); res.end(); return`. Do **not** construct a transport.
2. **New `McpServer` + new transport per HTTP request** (not one long-lived transport per agent — that rejects the next turn’s `initialize` with “already initialized”). `const server = new McpServer({ name: 'openbot', version: '1' })`, register that agent’s tools (`peer-tools.ts`; M5 also `mcp-browser/tools.ts`), `const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` (stateless; `undefined` is required, do not omit the key), `await server.connect(transport)`.
3. Body: if `req.method === 'POST'`, `const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); const raw = Buffer.concat(chunks).toString('utf8')`. `JSON.parse(raw)` — on throw `res.writeHead(400); res.end(); return`. Pass the parsed object as the third argument. GET/DELETE: omit the third argument.
4. `await transport.handleRequest(req, res, body)` then `res.on('close', () => { void transport.close() })`.

Delivery:

1. **Validate first** (§5.4). Only when `message_agent` would return `{ ok:true }` append a `peer-message` part `direction:'sent'` with **`text`** = the full `message_agent` body (not a précis). A rejected send (`not-found` / `self` / `paused` / `needs-login`) appends **no** part. There is **no** peer-loop / rate-limit rejection. The centered marker **Messaged B** shows `text` truncated in the UI at 140 characters; the part on disk keeps the whole string.
2. If B is `idle` **or** `error`, start a B turn (source `'peer'`). That turn’s parts **start with** one `peer-message` `direction:'received'` `{ text }` (the same full body), then normal assistant parts. User-equivalent input to the harness is that text. Add `'peer'` to `TurnSourceSchema`; delete `'routine'`.
3. If B is already in a turn (`thinking` / `needs-you` / `memorizing` / `compacting`): enqueue the text **and immediately** append a `peer-message` `direction:'received'` part `{ text }` onto B’s **in-flight assistant row** (push `kind:'peer-message'` so the unread dot fires on arrival). Do **not** write that part again when the queued turn starts.
4. **Order at turn end:** (a) `turn-finished` has already rewritten that turn’s line in `thread.jsonl` (§5.3 History); (b) Hindsight retain+snapshot (`source:'memory-writer'`) **completes**; (c) **then** start the next turn from the queue. A turn started from a mixed queue is `source:'peer'` if any queued item is a peer message, else `'user'`. Never start the next turn before memorizing finishes.
5. When B replies to A via `message_agent`, A (if idle) gets a new turn whose first part is `peer-message` `direction:'received'` with B’s full `text`. If A’s turn already ended, this **wakes** A (new turn). Menu bar **does** show unread on A.

### Memory load and write (Hindsight)

Live memory is **Hindsight** (retain / recall / reflect). Docs: https://hindsight.vectorize.io/developer/models , https://hindsight.vectorize.io/developer/api/main-methods , and HTTP shapes from https://hindsight.vectorize.io/developer/api/retain , recall, operations, api-reference (fetched 2026-08-14). Run **locally** on the Mac (`hindsight-api` on loopback). Not Hindsight Cloud. Do **not** expose Hindsight’s own UI to the user. One bank per agent; `bank_id` = `AgentConfig.memoryBankId` (UUID, not the slug). Keep a generated `MEMORY.md` snapshot so the files pane still works and A can still read B’s folder as files. Delete the daily-notes writer as the live brain (optional: stop writing `memory/YYYY-MM-DD.md` from the old writer). Files pane still lists `MEMORY.md`.

**Shipped packaging (locked — coding-agent milestone M2b):** Hindsight ships **fully inside the app** as **Python 3.11** + **`hindsight-all==0.9.0`** + **baked model weights**. First use initializes **offline** — **no** user `pip`, **no** Hugging Face download, **no** manual setup. **Authoritative recipe:** §5.5.8 (`scripts/dev/bundle-hindsight.sh` → `resources/hindsight/`). Packager is **electron-builder** (`extraResources` from that tree → `hindsight`; **not** inside asar). **electron-vite** is the **dev/build compiler only** — not an alternate packager for `extraResources`. Record pin in `packages/daemon/src/memory/hindsight-pin.json` (python version, `hindsight-all` `0.9.0`, model ids, sha256 of the **entire** `resources/hindsight/` tree — see §5.5.8). **Do not** treat `hindsight-darwin-arm64` CLI as the API server. **No packaged-app size cap** — keep full Hindsight; after the first package, measure and record size in `saved-results/openbot-app-size-YYYY-MM-DD.md`. **Dev mode (M1+):** run the **same** §5.5.8 script with `DEST=$HOME/.openbot/hindsight`. `scripts/dev/setup-hindsight.sh` may wrap that script — it is **not** the only path. **M2b** packaging + **ad-hoc / local signing** + Allow-click E2E land in §8; Developer-ID + notarize is a **follow-on after M2b** (not a blocker).

**Arch (locked):** v1 is **Apple Silicon only** (build machine = Apple Silicon). Electron main: `packages/app/src/main/arch.ts` exports `export function isAppleSilicon(): boolean { return process.arch === 'arm64' }`. Test: `packages/app/src/main/arch.test.ts`. On first launch when `!isAppleSilicon()`, show blocking copy **OpenBot needs Apple Silicon.** and **do not start the daemon** (or memory path). LLM retain/recall still uses Claude Code / Codex **network** for the language model (OK); embeddings/reranker stay offline from baked weights.

**First-use (locked):** do **not** copy `pg0` (or any pre-seeded DB) out of the bundle. Create an **empty** writable data root at `~/.openbot/hindsight/data` (`mkdir -p`; Hindsight creates `pg0` on first start). The bundle (packaged `extraResources/hindsight` or the §5.5.8 tree) stays **read-only**: python + baked weights + `bin/hindsight-api` wrapper only. Set `HF_HOME` to the **bundled** `hf-cache` inside `extraResources` (packaged) or the vendored cache under `~/.openbot/hindsight/hf-cache` (dev). Env always includes `HF_HUB_OFFLINE=1` and `TRANSFORMERS_OFFLINE=1` for the Hindsight child.

**Daemon spawn:** file `packages/daemon/src/memory/hindsight-spawn.ts` exports `spawnHindsight({ spawnFn, home, port }): { child: ChildProcess, port: number }`. Resolve entry as `join(resourcePath or ~/.openbot/hindsight, 'bin/hindsight-api')` (§5.5.8 wrapper). Bind **127.0.0.1 only**, writable data root `~/.openbot/hindsight/data` (created empty on first use). Preferred port `OPENBOT_HINDSIGHT_PORT` default **8888**.

**First-use UI (M2):** when Hindsight has not been initialized, show a non-modal progress state in the selected agent thread (or empty-team status) **Setting up memory…** with an indeterminate progress indicator. On success, hide it. On failure, show banner `memory-error` (actions `retry-memory`, `dismiss`) with actionable copy — never quietly disable memory.

Spawn: the §5.5.8 `bin/hindsight-api` wrapper (sets `HF_HOME`, offline flags, `HINDSIGHT_API_HOST=127.0.0.1`, `HINDSIGHT_API_PORT` from `OPENBOT_HINDSIGHT_PORT` or 8888, then `exec`s `$ROOT/python/bin/hindsight-api`). If the entry accepts `--host`/`--port`, pass `--host 127.0.0.1 --port ${port}`; M1 probe: run the bundled `--help` and pin flags in the same PR. Else rely on env `HINDSIGHT_API_HOST` / `HINDSIGHT_API_PORT`.

Env (exact):
- `HINDSIGHT_API_LLM_PROVIDER=claude-code` if Claude is logged in (`~/.openbot/claude-config/.credentials.json` exists), else `openai-codex`
- Override model: Claude `claude-sonnet-5`, Codex `gpt-5.6-luna` via `HINDSIGHT_API_LLM_MODEL`
- No extra API key
- `HINDSIGHT_API_EMBEDDINGS_PROVIDER=local` (model `BAAI/bge-small-en-v1.5` — baked)
- Reranker local (`cross-encoder/ms-marco-MiniLM-L-6-v2` — baked)
- `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HOME=<bundled cache path>`
- Isolated Codex home for Hindsight: `CODEX_HOME=~/.openbot/hindsight/codex` so token refresh does not log agents out (Hindsight docs: Isolating Codex auth). Copy shared `~/.openbot/codex-home/auth.json` into that home when present (same pattern as per-agent Codex spawn).
- Claude Code provider uses `CLAUDE_CONFIG_DIR=~/.openbot/claude-config` (same shared login).

**Bound port is the only port:** `spawnHindsight` returns `{ port }`. Daemon holds `hindsightPort` in memory. The HTTP client base URL, Claude `mcpServers.hindsight.url`, and Codex `config.toml` `[mcp_servers.hindsight]` url **all** use that port — never assume 8888 after a fallback. Rewrite every agent’s Codex `config.toml` when the port changes. `hindsight-spawn.test.ts`: after port+1 fallback, recorded `config.toml` contains the fallback port, not 8888.

**Missing / failed binary:** log `[memory] hindsight-missing`; **do not** silently no-op. Push banner `memory-error` on every agent with message **Memory could not start. Retry setup.** and action `retry-memory` (re-runs first-use init + spawn). Turns may still run, but memory failure stays **visible and actionable** until resolved. **Port in use:** try `port+1` once; still in use → log `[memory] hindsight-port-busy` and same `memory-error` banner (copy **Memory port is busy. Retry setup.**). Do **not** pick a random port. **Load-path recall failure:** omit the recall block from `memoryAppend`; still load preamble + `role.md` + `MEMORY.md`; log `[memory] recall-failed agent=<id>`; push a transient `memory-error` with message **Could not recall memory for this turn.** and action `dismiss` (do not permanently disable memory).

**HTTP client** (`packages/daemon/src/memory/hindsight-client.ts`, `fetch` against `http://127.0.0.1:${hindsightPort}`):
- **Retain:** `POST /v1/default/banks/{bank_id}/memories` JSON `{ items: [{ content: string, context?: string, document_id?: string }] }` (sync). Response includes `success`, `bank_id`, optional `usage.input_tokens` / `output_tokens` / `total_tokens`.
- **Recall:** `POST /v1/default/banks/{bank_id}/memories/recall` JSON `{ query: string, max_tokens?: number }`. Response `results` array of `{ text: string, ... }`. Snapshot `MEMORY.md` = join `results[].text` as bullets, cap ~**16_000** characters (~4000 tokens-worth). **Deliberate:** snapshot recall uses `max_tokens: 4000`; turn-start recall into `memoryAppend` uses `max_tokens: 1024` (snapshot fuller; turn-start short).
- **First retain on a new bank:** if HTTP **404**, `PUT /v1/default/banks/{bank_id}` with empty JSON `{}`, then retry retain **once**. If PUT itself 404s on the installed version, **stop and revise** (bank may auto-create — M1 probe: retain to a fresh id; if 200 without PUT, skip PUT in code).
- **`agent.delete` (order locked):** (1) Call `DELETE /v1/default/banks/{bank_id}` **first** (`bank_id` = `AgentConfig.memoryBankId`). **HTTP 404** = bank never existed → **proceed** with `team.json` row delete and `rm -rf` agent dir + `private/<slug>/`. **Memory down / non-404 refuse** (5xx, timeout, connection error, 401/403, etc.) → **abort**: leave agent + folders intact; push visible error (banner or modal) — do **not** `rm -rf`. (2) On DELETE **2xx** or **404**: remove the agent from `team.json`, then `rm -rf` agent dir + `private/<slug>/`. **Bank id is permanent and unique** (UUID at create) — **not** the reusable slug. Persist `memoryBankId` in `team.json`. Tests: non-404 DELETE failure leaves agent present; DELETE 404 still deletes files/row; delete Ada then create Ada (same name/slug) → recall of the new bank returns **no** old Ada facts.

**Restart Hindsight on `login-finished`:** on `login-finished {ok:true}`, re-evaluate provider (`claude-code` if `.credentials.json` exists, else `openai-codex`). If different from the running process, SIGTERM the child, wait 5s, SIGKILL, spawn again with the same missing-binary / port-busy branches. Test: start with no creds (`openai-codex`), then `login-finished` Claude → spawn env has `HINDSIGHT_API_LLM_PROVIDER=claude-code`.

Point **both** harnesses at Hindsight MCP `http://127.0.0.1:${hindsightPort}/mcp/${memoryBankId}/` (trailing slash; UUID bank id, **not** the slug) **in addition to** openbot MCP (use the **bound** port). If that MCP path 404s on the installed version, **stop and revise**. Fix every former `<slug>` bank path. Tests use a **fake HTTP client** (do not require a live `hindsight-api` in unit tests). `hindsight-spawn.test.ts`: missing binary does not throw; port-busy retries once; fake spawn records argv/env; after port+1, config.toml has the fallback port.

- **Session:** `AgentContext.sessionId` is the **active** harness session (`string | null`). Disk file `~/.openbot/private/<slug>/sessions.json` is `{ "claude-code": string|null, "codex": string|null, "lastInjectedSeq": { "claude-code": number, "codex": number } }` (`lastInjectedSeq` starts at 0). A normal user/peer turn **resumes** `sessionId` if set; if null, start a new session and persist the id into both `sessionId` and `sessions.json[activeHarness]`. Memory snapshot step and compact one-shots do **not** resume the main session. Compact-on-switch injects into the **destination** harness session (create one if null).
- **Load** at every turn start (including resumed): concatenate the fixed preamble (§5.5.6) + `role.md` + `MEMORY.md` as `memoryAppend`, then append a Hindsight `recall(bank_id=memoryBankId, query=user text, max_tokens=1024)` block (label it clearly in the append). If longer than **32_000** characters, keep the preamble intact and tail-truncate the rest so the whole string is 32_000. Claude Agent SDK option: `systemPrompt: { type:'preset', preset:'claude_code', append: memoryAppend }` (do **not** pass a string `systemPrompt` — that drops the Claude Code preset). Codex: write the same `memoryAppend` to `~/.openbot/private/<slug>/codex-home/AGENTS.md` immediately before the exec (Codex loads user instructions from `$CODEX_HOME/AGENTS.md`, then concatenates any project `workspace/AGENTS.md`). **Do not write or overwrite `workspace/AGENTS.md`** — that file is the agent’s.
- **Claude main turns** use streaming input. Build an async iterable, then pass **that object** (not the generator function) as `prompt`:

```
async function* userTurns() { yield { type:'user', message:{ role:'user', content: text } } }
query({ prompt: userTurns(), options: { cwd: workspaceDir, includePartialMessages: true, … } })
```

Not a string `prompt`. `cwd` is that agent’s `workspace/` (SDK `Options.cwd`, fetched 2026-08-13). Pass `includePartialMessages: true`. `interrupt()` exists only in that mode (`sdk.d.ts`). `chat.stop` / `agent.pause` call `query.interrupt()`. Compact one-shots stay a single-shot string query (no interrupt needed). Memory retain+snapshot is Hindsight HTTP (no harness query).
- **Claude adapter mapping** (`packages/daemon/src/turns/reducer.ts`, `export function applyEvent(parts: TurnPart[], ev: HarnessEvent): TurnPart[]`). SDK `query()` messages → harness events, then `applyEvent` folds into `thread.jsonl` parts. Daemon `package.json` `"exports"` includes `"./turns": "./src/turns/reducer.ts"`. The app renderer imports `{ applyEvent } from '@openbot/daemon/turns'` (same function; do not duplicate). `partId` for text/reasoning = `'m' + messageIndex + 'c' + blockIndex`. Keep a per-turn `messageIndex` starting at 0; increment it on every `stream_event` `message_start`, and on each complete `assistant` message if that message’s `message_start` was missed. `callId` = the SDK tool_use `id`. Concatenate deltas that share `partId`. Two reasoning parts in one turn are **two** collapsible rows (do not merge). From the complete `assistant` message use **only** `tool_use` blocks; ignore its `text` and `thinking` blocks, which repeat the deltas.

| SDK message | HarnessEvent | Turn part |
|---|---|---|
| `system` subtype `init` | `turn-started` `sessionId=message.session_id` | assistant row already exists (§5.2 mint). Persist that id. If this message never arrives, fill `sessionId` from the first `stream_event` / `assistant`, or `'pending'` until `result.session_id`. If nothing arrives in 60s, the §5.2 spawn-fail path. |
| `stream_event` `thinking_delta` / thinking block | `reasoning-text` `partId=m${messageIndex}c${index}` | `reasoning` concatenate |
| `stream_event` `text_delta` / text block | `assistant-text` `partId=m${messageIndex}c${index}` | `text` concatenate |
| `assistant` `tool_use` | `tool-use` `callId=id` `name=block.name` `inputSummary=(input.file_path \|\| input.command \|\| input.pattern \|\| JSON.stringify(input)).slice(0,200)` | `tool` row, `id=callId` |
| `user` `tool_result` | `tool-result` same `callId`; `name` from the paired `tool-use`; `ok=!is_error`; `outputSummary` first 500 chars of text content | same `tool` part |
| `result` (any subtype) | `turn-finished` `sessionId=result.session_id` `usage` = `{ costUsd: result.total_cost_usd if finite else null, inputTokens?, outputTokens?, contextWindow? }` from SDK `result` usage field names in `sdk.d.ts` that day + `contextWindow` from `packages/daemon/src/claude/models.json`; also set `AgentRuntime.contextUsed` / `contextWindow` and push `agent-runtime`; `outcome` = `complete` if subtype `success` else `error`; if not success, also `error` `fatal:true` `code:'cli-fatal'` `errorMessage` = that error `message` | close turn; spend still counts |

Do **not** copy the old plan’s `claude -p` argv. This table is the mapping.
- **Write (retain + snapshot):** after `turn-finished` (including interrupted/error) **only** when that turn’s `source` is `'user'`, `'peer'`, or `'resume-continue'` — never after `'memory-writer'`, `'compact'`, `'harness-switch-compact'`, `'clear'`, or `'inject'`. Set state `memorizing`. Keep `TurnSource` `'memory-writer'` for this step (hidden turn; cost still counts; `turn-created` is not pushed). Recipe (§5.5.1): (1) HTTP retain of `turnText(finishedTurn)` (bank create-on-404 as above); (2) HTTP recall and rewrite `MEMORY.md` as bullets from `results[].text` (cap ~16_000 chars). The Claude haiku one-shot writer is **gone** — do not spawn a harness for this. Hard cap **120 seconds**; on timeout or error, log `[memory] agent=<id> failed`, leave `MEMORY.md` untouched. Interrupted mid-turn: still run retain+snapshot on whatever completed (same cap). Compact-on-switch sets state `compacting` for the duration of that one-shot. `chat.stop` while `memorizing` or `compacting` returns `{ ok:true, stopped:false }` and does **not** kill Hindsight / compact. `chat.stop` while `thinking` or `needs-you` calls `query.interrupt()` / Codex SIGTERM and returns `{ ok:true, stopped:true }`. `chat.stop` while `idle` / `paused` / `error` returns `{ ok:true, stopped:false }`. **After memorizing** (success or fail): if `agent.pause` ran during this turn or the memory step, set state `paused` and **hold** the queue. Persist **stopped-turn context** on disk at `~/.openbot/private/<slug>/stopped-turn.json`: `{ turnId, harness, sessionId, interruptedAt, summaryText }` where `summaryText` = `turnText(finishedTurn)` capped at 8_000 chars (enough for Resume to continue without user text). `agent.resume`: (1) if queue non-empty, start the queued next turn as today; (2) else if `stopped-turn.json` exists for this harness/session, start a new streamed assistant turn `source:'resume-continue'` in the **same** harness `sessionId` with harness user input exactly `Continue the work that was stopped. Context:
` + `summaryText` (hidden from the composer; still show the new assistant stream); then delete `stopped-turn.json`; (3) else go `idle`. Else if that turn’s `outcome` is `error`, set state `error` (still start any queued next turn); clear `stopped-turn.json` only on successful resume-continue or clear. Else set `idle` then start the queued next turn (and clear `stopped-turn.json` when the interrupted path did not pause). A fatal harness result (`cli-fatal`) sets `Turn.outcome` to `error` **and** is what produces this `error` state. A `message_agent` / `chat.send` to a **paused** agent is rejected (`paused`) — it does not enqueue. Items already queued before the pause stay queued until Resume.
- **Spend:** add `costUsd` for sources `'user'`, `'peer'`, `'inject'`, `'memory-writer'`, `'compact'`, `'resume-continue'`. Do **not** add for `'harness-switch-compact'` or `'clear'` (no model call).
- Compact one-shot (hidden model call) uses `source:'compact'` and is `hidden:true`. **Visible divider mapping (locked):**
  - harness switch → turn `source:'harness-switch-compact'`, compaction `{ reason:'harness-switch', forHarness: destination }`
  - `/compact` / `agent.compact` → turn `source:'compact'`, compaction `{ reason:'manual', forHarness: current }` (after the hidden one-shot)
  - `/clear` / `agent.clear` → turn `source:'clear'`, compaction `{ reason:'clear' }` (**omit** `forHarness`)
  Renderer labels: `harness-switch` / `manual` → **Context compacted**; `clear` → **New conversation**. Keep `Turn.errorCode` on the schema; renderer does not display it.
- **Live divider wire:** visible divider turns are delivered live as **`turn-created`** (already defined) whose `source` / parts match the mapping above. The compaction **part** already has `id`. After a model compact (harness-switch / manual), also emit HarnessEvent `compacted` with `partId` = that part’s `id`, `reason`, and `forHarness` when present. `applyEvent` on `compacted` upserts a compaction part with that `partId`. **`/clear` live path:** `turn-created` is sufficient; `compacted` **may be omitted** when there is no model call.

### A must not write B’s folder

Enforce with a **PreToolUse** hook on every tool (no matcher — runs for all names). Register on the `query` options (docs: https://code.claude.com/docs/en/agent-sdk/hooks fetched 2026-08-13):

```
hooks: { PreToolUse: [{ hooks: [writeDeny] }] }
```

Deny return (exact):

```
{ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Cannot write another agent\'s folder.' } }
```

Allow: `{}`. `write-deny.test.ts` asserts this **return object**, not only a path helper. The hook runs **before** the permission flow. There is **no** per-tool approval card in v1. `canUseTool` returns `{ behavior:'allow', updatedInput: input }` for every tool **except** `AskUserQuestion` (that one waits for `ask.answer`). See §5.3.

Deny **writes** to `~/.openbot/agents/<other-slug>/`. **Candidate paths by tool name (Claude Agent SDK built-ins):**
- `Write`, `Edit` → `input.file_path`
- `NotebookEdit` → `input.notebook_path`
- `Bash` **and** `mcp__openbot__shell_run` → existing `shell-quote` extraction on `input.command` (below)
- **Any other tool:** walk every **string** value in `input` (one level; also one nested object’s string values). Each string that looks like a path (contains `/` or starts with `~` or `.`) is a candidate. If **any** candidate resolves into a denied folder, **deny** — unless the tool name is `Read`, `Glob`, or `Grep` (those still allow other-agent folders; they still deny private/credential paths as already specified).

**Resolve (exact):** Expand a leading `~` or `$HOME` to `os.homedir()`. `resolved = path.resolve(cwd, candidate)` where `cwd` is the turn’s cwd (`workspace/` for main turns). Walk up from `resolved` until a path that exists, `fs.realpathSync` that ancestor, then rejoin the missing tail. Deny if the result equals the other agent’s folder or is under it (`result === otherDir || result.startsWith(otherDir + path.sep)`). Relative `../../bea/MEMORY.md` from Ada’s `workspace/` therefore denies. Same resolve step for the all-tools deny list (`private/`, `team.json`, `login-url`, credential dirs). **Allowed:** `Read`, `Glob`, `Grep` of another agent’s folder (A may read B’s `MEMORY.md`). Bash extraction (pin `shell-quote` from `npm view`): `parse(command)` (from `shell-quote`). Walk tokens; split into segments on operator tokens `;`, `&&`, `||`, `|`. Per segment: collect (a) the string immediately after `>` or `>>`; (b) the last string argument of `cp` or `mv`; (c) every string argument of `rm` / `mkdir` / `touch` / `tee` that does not start with `-`. Run each candidate through the resolve algorithm above with the turn’s cwd. Deny if any matches. If `parse` throws or yields no string tokens, **deny** the whole command. `cat` of B’s `MEMORY.md` is allowed. Tests: quoted path `echo x >> '~/.openbot/agents/bea/MEMORY.md'` denied; `true && echo x >> ../../bea/MEMORY.md` from Ada’s workspace denied; unparseable command denied. User sees a denied tool row `ok:false` with `outputSummary` “Cannot write another agent’s folder.” Tests in `write-deny.test.ts`: Bash `echo x >> ~/.openbot/agents/bea/MEMORY.md` is denied; `Write` of `../../bea/MEMORY.md` from Ada’s `workspace/` is denied; Bash `echo x >> ../../bea/MEMORY.md` from that cwd is denied; `NotebookEdit` `{ notebook_path: '<abs bea MEMORY.md>' }` denied; a fake tool `Patch` `{ path: '<abs bea file>' }` denied; `Read` of that path still returns `{}` (allow).

`browser-profile/`, `claude-config/`, and `codex-home/` are denied to **all** harness file tools (Read included — cookies and OAuth tokens stay out of the thread). Same deny on the owner’s own folder for those three directories, and on the shared `~/.openbot/claude-config/` and `~/.openbot/codex-home/`. Also deny **all** harness file tools (Read included) on `~/.openbot/team.json` and `~/.openbot/login-url` (absolute or home-relative). User-visible deny row: `outputSummary` “Cannot read OpenBot private files.” `write-deny.test.ts` also asserts: `Read` of `~/.openbot/team.json` is denied; Bash `cat ~/.openbot/team.json` is denied; `Read` of `~/.openbot/private/bea/browser-allow.json` is denied; `Read` of another agent’s `MEMORY.md` still returns `{}` (allow).

**Codex (M1b):** product rule matches Claude — folder is context, not a cage. Codex may work elsewhere on the Mac. Both harnesses must **deny writes** to other agents’ folders and OpenBot private/system paths while allowing other Mac work. Daemon writes `~/.openbot/private/<slug>/codex-home/config.toml` (full file below) and sets env `CODEX_HOME` to that directory so this does not change the user’s `~/.codex`. Cwd for a main turn = that agent’s `workspace/`.

**Codex write-deny (locked — verified Codex CLI 0.147.0):** Do **not** ship `writable_roots=["<homeDir>"]`. Do **not** combine legacy `sandbox_mode` / `[sandbox_workspace_write]` with `default_permissions` (they conflict). Use **permission profiles**:

Full `config.toml` (rewrite when agents are created/deleted **and** when Hindsight port changes; replace `<agentId>`, MCP token, `<abs otherDir>` list, and **bound** Hindsight port):

```
approval_policy = "never"
default_permissions = "openbot"

[features]
default_mode_request_user_input = true
shell_tool = false

[permissions.openbot]
description = "OpenBot agent"

[permissions.openbot.filesystem]
":root" = "write"
"/Users/<user>/.openbot/agents/<other-slug>" = "read"   # each other agent, rewritten on create/delete
"/Users/<user>/.openbot/private" = "deny"
"/Users/<user>/.openbot/claude-config" = "deny"
"/Users/<user>/.openbot/codex-home" = "deny"
"/Users/<user>/.openbot/hindsight" = "deny"
"/Users/<user>/.openbot/team.json" = "deny"
"/Users/<user>/.openbot/login-url" = "deny"

[permissions.openbot.network]
enabled = true

[mcp_servers.openbot]
url = "http://127.0.0.1:8799/mcp/<agentId>?token=<mcp-token-for-that-agent>"
tool_timeout_sec = 3600

[mcp_servers.hindsight]
url = "http://127.0.0.1:<hindsight-port>/mcp/<memoryBankId>/"
tool_timeout_sec = 3600
```

**Path rule (locked):** more-specific path wins over `:root`. Daemon expands `os.homedir()` when writing the file (replace `/Users/<user>` with the real home). Tests assert these keys (templated with the test home).

**M1b probe (fail closed):** run with **`--strict-config`**. Assert `codex doctor` / features show the openbot profile loaded; a Codex turn can write under `$HOME/Desktop` (or other non-denied home paths) **and** a write into `~/.openbot/agents/<other-slug>/` is denied (read still allowed) **and** private/credential paths are denied including read. If permission keys were ignored without `--strict-config` (would have falsely passed), they **must fail** with `--strict-config`. If the CLI rejects these permission keys → **stop and revise** — do **not** fall back to `writable_roots=["<homeDir>"]` or own-folder-only. Keep the MCP / `shell_run` write-deny extractor as a **second gate**.

`approval_policy = "never"` is locked. `[features] default_mode_request_user_input = true` and `shell_tool = false` are locked when the preferred visible-shell path is available (native ask cards; preferred MCP shell — §3.5 Visible shell). If `shell_tool = false` / MCP path is missing, keep built-in `command_execution` (capability first). Do **not** add `collaboration_modes` / Plan mode. Claude main turns also register Hindsight MCP alongside openbot (`mcpServers` map with both HTTP URLs keyed by `memoryBankId`). If the Hindsight `/mcp/${memoryBankId}/` path 404s on the installed server, **stop and revise**.

**Enforcement parity:** Claude uses PreToolUse write-deny (§3.5) on both `Bash` and `mcp__openbot__shell_run`. Codex uses the permission profile **and** the daemon must still refuse MCP/browser/shell paths that would write another agent’s folder. Codex **can read** other agents’ folders (same as Claude) via `"<abs otherDir>" = "read"`. Private deny includes read.

### Harness switch + Codex

- **Rename** protocol `bot.*` → `agent.*` in one M0 pass (`agent.setHarness`, `agent.pause`, …). Do not keep both.
- Compact-on-switch: `packages/daemon/src/harness/switch.ts`. Allowed from states `idle`, `paused`, `error` (busy otherwise). Slice = every visible turn with `seq > lastInjectedSeq[toHarness]`, joined as `[user]\n{text}\n---\n[assistant]\n{text}` (same prefixes as the §5.2 queue; `role:'user'` → `[user]`, else `[assistant]`; skip empty-part turns), **tail-truncated to 32_000 characters**. `{text}` = `turnText(turn)` defined in §5.5.1. Empty slice: flip harness, do **not** emit `compacted`, do **not** compact or inject, set `lastInjectedSeq[to]` to current max seq, then run **post-switch continue** below. Non-empty: one-shot compact (prompt §5.5.2, **no** resume of the main session) → inject the briefing as the user message on the **destination** session (create if null). That inject turn is `source:'inject'`, `hidden:true`, persisted to `thread.jsonl`, **not** streamed to the window; its `costUsd` still adds to spend. Then emit the visible divider (`source:'harness-switch-compact'`, compaction `{ reason:'harness-switch', forHarness: toHarness }`, label **Context compacted**) as live `turn-created` plus `compacted` with `partId` → set `lastInjectedSeq` for **both** harnesses to the divider’s seq. **Post-switch continue (locked):** after a successful flip (empty or compacted): (1) if `stopped-turn.json` exists, **ONLY rewrite** its `harness` + `sessionId` to the **destination** (delete any ignore-fields branch — do not leave those fields stale), then immediately start Resume-continue on the destination (source `'resume-continue'`). **If destination `sessions.json[to]` / `sessionId` is null:** create a **new** destination session first, persist the id into both `AgentContext.sessionId` and `sessions.json[to]`, rewrite `stopped-turn.json` with that new `sessionId`, then continue (do **not** resume a null session). (2) if the agent was `paused` but **no** `stopped-turn.json` exists → go **`idle`**, start **no** turn; (3) otherwise idle as usual. Do **not** leave the agent paused after a successful switch when continue applies. Spend from compact/inject/continue is allowed because the user initiated the switch. On `compact-failed` / `inject-failed`: stay on the old harness, restore prior state (`paused`/`idle`/`error`), show the error, do not switch, do not start continue. Tests: `packages/daemon/test/harness-switch.test.ts`.
- **Codex argv** (binary `codex` on PATH; env `CODEX_HOME` = `~/.openbot/private/<slug>/codex-home`; cwd = `workspace/` for main/resume/stop). Verified this machine **2026-08-14**, `codex-cli 0.147.0`, `codex exec --help`: model is `-m` / `--model <MODEL>`; **no** `--effort` and **no** `--plan` on exec; generic override is `-c, --config <key=value>`; **`--strict-config`** is present (errors on unrecognized `config.toml` keys — required so permission profiles do not fail open). Context7 `/openai/codex` (config_toml.rs / cli docs): effort is config key `model_reasoning_effort`. Spawn with `{ detached: true, stdio: ['pipe','pipe','pipe'] }` so stdin is open for `request_user_input` answers and the child is its own process-group leader. `codex.test.ts` asserts `detached: true` and `stdio[0] === 'pipe'`. Non-resume execs include `--json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check` plus `--model <AgentConfig.model>`. **Never** pass `--sandbox` / `--sandbox workspace-write` — the permission profile in `config.toml` is the gate. When `AgentConfig.effort` is set, append **exactly** `-c model_reasoning_effort=<effort>` (example: `codex exec "<msg>" --json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check --model gpt-5.6-luna -c model_reasoning_effort=high`). If the CLI rejects that `-c` key, **stop and revise**. Do **not** pass `--effort`. **`codex exec resume` accepts `--strict-config`** (verified 0.147.0 `codex exec resume --help`) and **does not accept `--sandbox`**. Main and resume both rely on the permission profile in `config.toml` **with** `--strict-config`. Do **not** pass `--ask-for-approval`. Do **not** pass `--dangerously-bypass-approvals-and-sandbox`.
  - First turn: `codex exec "<msg>" --json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check --model <model> [-c model_reasoning_effort=<effort>]`
  - Resume: `codex exec resume <threadId> "<msg>" --json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check --model <model> [-c model_reasoning_effort=<effort>]`
  - Stop: `process.kill(-child.pid, 'SIGTERM')` then `process.kill(-child.pid, 'SIGKILL')` after 5s. `inFlightPid` is `child.pid`.
  - Compact one-shot: `codex exec "<msg>" --json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check` (no `resume`). Memory snapshot no longer uses Codex.
  - `codex.test.ts` asserts argv contains **no** `--sandbox`; **contains** `--strict-config` on main, resume, and compact; main turns include `--model`; when effort is set, argv contains `-c` `model_reasoning_effort=<effort>` and does **not** contain `--effort`.
- **Codex auth.json copy-back:** on every Codex `turn-finished` (any outcome): if `private/<slug>/codex-home/auth.json` exists, copy it over shared `~/.openbot/codex-home/auth.json` (overwrite). Spawn still copies shared → per-agent **before** exec (existing). Login spawn continues to use shared `CODEX_HOME`. Hindsight isolated home unchanged (still copy shared → hindsight, never copy hindsight back onto shared). `codex.test.ts`: after a fake turn writes a different `auth.json` in the agent home, the shared file matches it.
- **Codex `request_user_input` — probe done (2026-08-14), map from fixtures:** Live probe on CLI **0.147.0** proved exec mode cannot ask; **app-server** can. Fixtures (do not invent):
  - `packages/daemon/test/fixtures/codex/request-user-input.jsonl` — one JSON-RPC server request line: `method` = `item/tool/requestUserInput`, `params.questions[]` with `id`, `header`, `question`, `options[].label` / `description`.
  - `packages/daemon/test/fixtures/codex/request-user-input-answer.jsonl` — client response `{ "jsonrpc":"2.0", "id": <same id>, "result": { "answers": { "<id>": { "answers": ["Alpha"] } } } }`.
  - Field map (locked from fixture): question text = `params.questions[].question`; `header` = `params.questions[].header` (else first 12 chars of question); `options[].label` / `description` from fixture; `multiSelect` = `false`.
  - On `ask.answer`: write that JSON-RPC response to the **app-server** child’s stdin (newline-delimited JSON-RPC), matching the pending request `id`. Assert the turn continues (`DONE:…` / `turn/completed` in `probe4-app-server-ask.jsonl`). **No prose fallback. No exec-stdin answer path.**
- **Codex JSONL** (observed `codex exec --json`, 0.147.0): envelopes `{type}` at the top level. `thread.started.thread_id` → `turn-started` `sessionId=thread_id` (insert assistant row) and store in `sessions.json` / `AgentContext.sessionId`. `turn.started` → ignore (or log). `item.completed.item` is where `type` is `reasoning` | `command_execution` | `agent_message` | `mcp_tool_call` | `error` | others (plus `request_user_input` once the fixture pins the envelope). Also `item.started`. Map: `reasoning`→`reasoning-text` `partId=item.id`; `agent_message`→`assistant-text` `partId=item.id`; `mcp_tool_call` (preferred for shell when `shell_tool = false`)→`tool-use`/`tool-result` with `name=item.tool||'mcp'`; keep a mapper for `command_execution`→Bash as the **built-in fallback** when MCP visible shell is unavailable. **Do not fail M5** solely because main-agent JSONL still emits `command_execution` when the preferred path was missing or the probe failed — capability first (§3.5 Visible shell). **Drop** `item.type==='error'` whose message mentions hook trust. `turn.failed` and bare `{type:'error'}` → harness `error` `fatal:true` `code:'cli-fatal'`. `turn.completed` → `turn-finished` `sessionId` = the stored `AgentContext.sessionId` (the `thread_id` from `thread.started`; `turn.completed` does not carry it).
- **Codex usage field names — probe, don’t invent:** extend the M1b `--json` probe: save `turn.completed` (and any usage-bearing item) verbatim to `packages/daemon/test/fixtures/codex/turn-completed.jsonl`. Pin token field names from that file here after the probe. Until the probe lands: if no usage object, donut empty + “Waiting for usage”, spend chip “—” for that turn. Do **not** invent field names. After the probe, `codex.test.ts` maps those exact keys into `turn-finished.usage` / runtime context fields.
- **M2 Codex button:** enabled (M1b already landed). While a turn is in flight, disabled with tooltip “Wait until this turn finishes.”
- **M1b (after M1, before M2):** Codex CLI JSONL adapter (envelope grammar in §3.5). Spend chip shows `spendUsdToday` (calendar day, local TZ). Claude from `turn-finished.usage.costUsd`; Codex from its JSONL usage if present, else `null` and the chip shows “—” for that turn (do not invent a price table). M1b does not ship until the shared MCP has **peer tools + write isolation**. `browser_*` is **M5**, not M1b.

### Browser engine + right-pane tabs

- Electron **`WebContentsView`** (not deprecated `BrowserView`; not CEF). Docs: https://www.electronjs.org/docs/latest/api/web-contents-view (fetched 2026-08-13). Main process: `win.contentView.addChildView(view)` then `view.setBounds({ x, y, width, height })` from the React right-pane browser slot’s `getBoundingClientRect()` via IPC on every layout (resize, Cmd+Shift+B, tab switch, hide pane → off-window or `removeChildView`). Do not leave the view at `(0,0,window)`.
- **Several browser tabs per agent:** each browser tab is its own `WebContentsView` sharing that agent’s `session.fromPath(~/.openbot/private/<slug>/browser-profile)`. The **frontmost** browser tab of the **selected** agent gets the pane rect. Every other view (other tabs, other agents) gets `setBounds({ x: -2000, y: 0, width: 1280, height: 800 })` (off-window, real size — never height 0). Snapshot and screenshot of a non-frontmost / non-selected view still return a non-empty result. Agent browser tools target the **frontmost** browser tab. Agent may open additional browser tabs (those come to the front).
- **Tab close + pane lifetime (locked):** every Browser / Terminal / Files tab shows a close control (×) and supports middle-click close. Keyboard: focus the tab chip then Delete/Backspace closes it (also document **Cmd+W** closes the frontmost right-pane tab of the selected agent). Closing a Browser tab destroys that `WebContentsView` and drops its bounds; closing a Terminal tab kills that pty and clears its ring. Closing a Files tab drops its preview state. **Last tab closed → right pane closes** (strip hidden until `+` or an agent tool opens a tab again). Overflow: when tabs exceed the strip width, show a trailing overflow chevron menu listing hidden tab titles (title = page title / `Terminal` / file name, truncated). Max **12** tabs per type per agent; creating the 13th closes the oldest background tab of that type (with a one-line toast **Closed oldest {type} tab**).
- Profile: `const ses = session.fromPath(absolutePath)` with path `~/.openbot/private/<slug>/browser-profile` (must be absolute). Construct `new WebContentsView({ webPreferences: { session: ses } })` — that is the only way the profile attaches. Docs: https://www.electronjs.org/docs/latest/api/session (fetched 2026-08-13).
- Right-pane tab strip is **in v1** (Browser / Terminal / Files; multiple of each; no Review). **M5 builds** thin themed chrome in `packages/app/src/renderer/browser/Chrome.tsx` over Electron `WebContentsView`: URL bar, back/forward/reload, and You’re driving / Return control (M2a = contract only). Theme to ChatGPT desktop / Codex tokens (§6). Do **not** pin/fork `electron-browser-shell`, Reframe, or `electron-as-browser`. Terminal and Files tabs remain app React (pty for Terminal); they are not `WebContentsView`s. M2: Browser tab entry **disabled** with **Coming in a later build** until M5.
- File-upload automation: skip because ChatGPT’s built-in browser cannot do it and we are copying that surface; agents attach files through the thread/workspace instead.
- **Hidden window:** if `browser.exec` arrives while the BrowserWindow is hidden, create / reuse a `WebContentsView` on that **hidden** window, run the op, and **do not** call `show()` / `focus()`. For `screenshot`, `capturePage(undefined, { stayHidden: true })`. The window stays down (menu bar title rules are §3.5 Menu bar). Same rule if the pane was never opened — create the view without raising the window. **Window up, no Browser tab:** if `browser.exec` arrives while the window is visible and that agent has no Browser tab yet, **add a visible Browser tab** to that agent’s strip, make it frontmost, then run the op (`browser.spec.ts` asserts the tab appears).
- **Downloads:** on that agent’s `session`, `will-download`: `item.setSavePath(join(app.getPath('downloads'), item.getFilename()))`. Do **not** show a save dialog. Same as ChatGPT desktop → the Mac Downloads folder.
- **New windows → new tab:** on that `WebContents`, `setWindowOpenHandler` **always** returns `{ action:'deny' }`. Then open a **new** `WebContentsView` tab for `details.url` (same host check / `needs-site` path as navigate), bring it to the front, and `loadURL`. No second OS window. `agentOpInFlight` is **per agent**, not global.

### Take over (in-app browser)

**Click inside the agent browser automatically takes control.** Listen on that `WebContents` for Electron **`before-mouse-event`** (https://www.electronjs.org/docs/latest/api/web-contents — fetched 2026-08-13). On `mouse.type === 'mouseDown'`, app sends `browser.setHumanControl { held:true }` (do not `preventDefault` — the click still reaches the page). An explicit pane control **Take control** does the same.

**Visible state (browser pane only):** while `humanControl.held === true`, the browser pane chrome shows a clear bar **You’re driving** and a button **Return control**. Do **not** add a thread marker, team-row status, or banner for takeover. Team row may still say **working** while tools are blocked — the pane bar is the signal.

Agent ops must **not** use `sendInputEvent`. They run in-page via `webContents.executeJavaScript` (click/type/snapshot) or `loadURL` / `capturePage` (navigate/screenshot), so they do **not** fire `before-mouse-event`. While held: agent browser tools return `human-control-held`. **Return control** is the only `{ held:false }` and **unblocks** agent browser tools. Agent’s next tool result text: “Human returned control; page is still at &lt;url&gt;. Continue from here.” No VNC.

### Visible shell (main agent — locked)

**Capability first, visibility second (general rule):** Prefer running main-agent shell in a **visible** Terminal tab via MCP. If that path is missing or the probe fails, **keep** built-in Claude Bash and Codex `command_execution`. Never disable a real harness capability just because we cannot show it in our UI. Apply this generally. Nested Agent / subagent private shell is **allowed** (document in preamble; do **not** disable the Agent tool). **M5 must NOT fail-closed on built-in shell.**

**Claude Agent SDK (main turns):**
- Official Claude Agent SDK TS docs list `toolAliases` (`Record<string,string>`, e.g. `{ Bash: 'mcp__workspace__bash' }`). OpenBot uses `{ Bash: 'mcp__openbot__shell_run' }` when available.
- **Pin against `sdk.d.ts`:** if `toolAliases` is absent from the pinned SDK types, **do not remove Bash** — skip the alias and keep built-in Bash.
- When aliases are present: pass `toolAliases: { Bash: 'mcp__openbot__shell_run' }`. Do **not** omit `Bash` from the tools set when using aliases (alias target must exist).
- PreToolUse write-deny matcher / path walk applies to **both** `Bash` and `mcp__openbot__shell_run` (same shell-quote extractor on `command`).
- Trace tool row name: show `shell_run` / Bash alias as a named shell tool when MCP path is used; click → `terminal.focus`. Built-in Bash still shows a tool row.

**Codex:**
- Preferred: `[features] shell_tool = false` in that agent’s `config.toml` (with the permission profile in §3.5) + MCP `shell_run` → JSONL `mcp_tool_call`.
- If that preferred path is missing or the probe fails: keep built-in `command_execution` and still pass M5.

**MCP `shell_run`** (register in M5 **only** in `packages/daemon/src/mcp-browser/tools.ts` — **no** second file such as `mcp/shell-tools.ts`):
- Input: `{ command: z.string(), cwd?: z.string(), timeoutMs?: z.number(), tabId?: z.string() }`
- Result text JSON: `{ exitCode, tabId, timedOut?, output }` with `output` capped at **32_000** for the model.
- Handler: write-deny extract on `command` first → else daemon→app `terminal.run` with `stealFocus:false`.
- Preferred path still MCP visible tab; fallback built-in shell if MCP/app missing.
- Pin description strings in §5.5.6; `shell-mcp.test.ts` asserts those strings.

**M5 probe:** assert the preferred path **when available** (`toolAliases` present → Bash executes as MCP; Codex `shell_tool = false` → `mcp_tool_call`). If alias/feature missing, document fallback to built-in and **still pass**. Nested Agent private shell allowed.

**Focus:** creating or running a tab **never** steals window/thread focus. Tool-row click → preload `terminal.focus`.

### AskUserQuestion lifecycle

- **Answer:** `{ behavior:'allow', updatedInput:{ questions, answers } }`.
- **Other / typed:** answers value is the typed text.
- **Answer in chat instead:** enables composer answer mode; the next Enter / send is `ask.answer` with `response` = that text (primary becomes Send for that one submission). Composer while the card is still **open** (not yet Answer-in-chat) enqueues (§5.2) and does not answer; primary stays Stop.
- **Stop** or `agent.pause` while open: `{ behavior:'deny', message:'User stopped' }`; part `status` becomes **`cancelled`**; turn `interrupted`. Card renders as a dimmed row “Stopped before you answered.” Only `status:'open'` parts are re-shown as live cards after a crash; `cancelled` and `answered` are history.
- Window close: callback **keeps waiting** (daemon + menu bar stay up).
- **Quit:** if any agent has an `open` card, **block** with a modal: title **An agent is waiting on you**; body lists waiting agent names (comma-separated). Buttons: **Open OpenBot** (default — `show()` and select the first waiting agent’s thread) and **Stop and quit** (for each open waiter: `canUseTool` `{ behavior:'deny', message:'User stopped' }`, part `cancelled`, turn `interrupted`, then `app.quit()`). `canUseTool` itself only returns `allow` or `deny`. The official `defer` hook exists on the **hooks** page; we do **not** wire it in v1. Persist the open card in `thread.jsonl` (crash recovery: re-show **open** cards only). `ask.answer` on a card with **no live `canUseTool` callback** (callback died with the old process): mark the part `answered`, store `answers`/`response`, push `ask-user-question-status`, and start a **normal user turn** whose text is one `"{question}: {label}"` line per answered question (`response` if set is the whole body instead). `{ ok:true }`. `not-open` is returned **only** when that part’s `status` is already `answered` or `cancelled`.

### Lasting across crash / sleep

- Sleep: process stays; turns continue if the Mac didn’t throttle (no extra work).
- Daemon crash: systemd/launchd is **out** for v1; Electron child respawns the daemon on app relaunch. In-flight turn → `interrupted`. Thread + memory files are the source of truth.
- Reboot: agents are idle until the app (or menu bar login item — later) starts. No cloud continue.
- **Socket drop while the window is open:** on WebSocket `close` or `error`, the app shows a bar **Lost the background service. Reconnecting…** (app-local; not a daemon banner). Retry connect at 1s, 2s, 4s, then every 15s. If the daemon child has exited, respawn it (same spawn as launch). `EADDRINUSE` → the Port in use dialog. On reconnect: `event.stream { after: lastEnvelopeId }`. If the ring cannot satisfy `after`, the daemon pushes a **bare** WS text frame `{ type:'event.stream.meta', replayReset: true }` — this is **`EventStreamMetaSchema`** (already in `packages/protocol/src/messages/event-stream.ts`). It is **not** a `StreamEnvelope` channel and **not** a `DaemonEvent` kind. Then the app runs `chat.history` + `agent.get` (restore banners from the `banners` field). E2E (`OPENBOT_DAEMON_WS` set): retry connect only, do not respawn.
- **Second window:** Electron `app.requestSingleInstanceLock()`. A second instance focuses the first and exits.
- **Port in use:** if the daemon child exits because `127.0.0.1:8799` is `EADDRINUSE`, show a dialog titled **OpenBot is already running** with buttons **Check the menu bar** (default — then `app.quit()`) and **Stop the other copy**. **Stop the other copy:** run `lsof -nP -iTCP:8799 -sTCP:LISTEN -t`, `process.kill(pid, 'SIGTERM')` for each pid, wait up to 5s for the port to free, then `SIGKILL` any leftover, then **retry spawn once**. If still `EADDRINUSE`, dialog “Could not free the port.” and `app.quit()`. Do not pick another port. Do not silently adopt an unknown process.
- **Quit kills the daemon:** `app.on('before-quit')` sends `SIGTERM` to the daemon child, then `SIGKILL` after 5s, then `app.exit(0)` on child `exit` or after the kill. Do not leave `8799` held. E2E with `OPENBOT_DAEMON_WS` set skips this (no child).

### Concurrency

Several agents may run turns at once (one live query per agent). No global lock.

### Logos

`scripts/fetch-harness-icons.sh`: **create** in M2 from §5.5.3 (the file is not in the repo today). Official Claude Code + Codex SVG, recolor to black/white, sha256 pin in M2 tests. Put files in `packages/app/src/assets/harness/`.

### Harness login (local Mac)

Ignore the container / `DISPLAY` / xfce4-terminal / `/bot/state/login-url` sections of `e2e/computer-use/harness-login.md` — those belong to the deleted remote box. Keep the Mac Chrome **Allow** steps.

**Credentials are shared** across the team (one Claude login, one Codex login — not per agent). Probe (daemon, on create / setHarness / chat.send): Claude `logged-in` iff `~/.openbot/claude-config/.credentials.json` exists; Codex iff `~/.openbot/codex-home/auth.json` exists. Else `logged-out`. All agents set `CLAUDE_CONFIG_DIR=~/.openbot/claude-config`. Per-agent Codex config lives at `~/.openbot/private/<slug>/codex-home/` (not inside the agent folder). On every Codex spawn, if the shared `auth.json` exists, copy it into that `CODEX_HOME/auth.json`. On every Codex `turn-finished`, copy per-agent `auth.json` back onto shared when present (§3.5 Codex auth.json copy-back). Login spawn uses the **shared** `CODEX_HOME=~/.openbot/codex-home`. First launch (app, before spawn): `mkdir -p ~/.openbot/claude-config ~/.openbot/codex-home ~/.openbot/agents ~/.openbot/private ~/.openbot/hindsight/codex` and write `~/.openbot/team.json` `{ "agents": [] }` if missing. **Daemon startup does the same** when those paths are missing (M1 has no app), then spawns `hindsight-api`. `agent.create` / `agent.delete` / `agent.setHarness` rewrite `team.json` (§5.2).

**Start login (M1):** daemon memory holds **one** `loginPid` per harness (not per agent), stored on the requesting agent’s `AgentContext.loginPid` as well. If that harness already has a `loginPid`, return `{ok:false, error:'busy'}` and do not spawn. The `log-in` banner action is **disabled** while that harness’s `loginPid` is set. **Before spawning,** `fs.rmSync(join(OPENBOT_HOME, 'login-url'), { force: true })`. Then spawn:
- Claude: `claude auth login` with `CLAUDE_CONFIG_DIR` = `join(OPENBOT_HOME, 'claude-config')` and `BROWSER` = `process.execPath + ' ' + join(repoRoot, 'scripts/dev/print-login-url.mjs')` (both absolute). Spawn env includes `OPENBOT_HOME` (the daemon’s data root). `print-login-url.mjs` writes argv URL to `join(process.env.OPENBOT_HOME, 'login-url')` then exits 0. Stdout is the fallback URL source (`parseClaudeLoginUrl`: strip ANSI `\x1b\[[0-9;]*m`, rejoin wrapped `https://` lines, first `new URL` with `http:`/`https:`). Fixtures: `packages/daemon/test/fixtures/login/claude-auth-url.txt` and `claude-auth-url-wrapped.txt`.
- Codex: `codex login --device-auth` with `CODEX_HOME=~/.openbot/codex-home`. **Do not** rely on `$BROWSER` (Codex 0.147.0 does not read it). Parse stdout with `parseCodexDeviceAuth`: strip ANSI, rejoin wrapped URLs, capture the `https://` URL containing `/codex/device` and the one-time `userCode` on the line after `one-time code`. `new URL` must succeed. Fixture: `packages/daemon/test/fixtures/login/codex-device-auth.txt`.

Then:
1. Within 60s, obtain a valid URL (Claude: file then stdout; Codex: stdout only). For Claude, accept `login-url` **only if its `mtime` is after the spawn** (a leftover from a previous attempt is ignored). Push `login-challenge` `{ url, needsPasteCode, userCode? }` (`userCode` only for Codex when parsed).
2. **M1 Claude paste-code probe:** capture one real `claude auth login` into `~/.openbot/claude-config`. If the vendor returns a code that must be pasted back into the CLI/app, set `needsPasteCode: true`, keep the banner paste field, and **keep** `harness.completeLogin`. If the pinned flow never needs paste (localhost callback only), set `needsPasteCode: false` and **then delete** `harness.completeLogin` **and** update the M0 “kept” assertion in the **same PR**. Do not hard-delete paste support before the probe. **M0 itself always keeps** the message and asserts it is present.
3. On `login-challenge`, the **app main process** runs the real Mac Chrome runbook from `e2e/computer-use/harness-login.md` (ignore container sections). **M2b path:** **ad-hoc / locally signed** app (**not** App Sandbox / **not** Mac App Store); `appId` / bundle id **`com.openbot.app`**. Bundle helper `OpenBot.app/Contents/Helpers/openbot-axclick` (built from §5.5.7). **No `cliclick`.** Developer-ID + notarize is a **follow-on after M2b**. **After each ad-hoc rebuild:** re-grant Accessibility and Screen Recording before M2b verify / M7 (do **not** chase a stable ad-hoc identity).
   - **Permissions OpenBot requests (and clicks Allow itself):** Accessibility, Screen Recording, and Apple Events for Chrome. Pin Info.plist via electron-builder `extendInfo`: `NSAppleEventsUsageDescription`, `NSScreenCaptureUsageDescription` (plain copy in §8 M2b). Entitlement: `com.apple.security.automation.apple-events` (no App Sandbox). Electron checks: `systemPreferences.isTrustedAccessibilityClient(...)`; screen via `systemPreferences.getMediaAccessStatus('screen')` — **`askForMediaAccess` does not cover screen**.
   - Preflight: if Accessibility or Screen Recording is denied, push `needs-login` with message **OpenBot needs Screen Recording / Accessibility to finish sign-in in Chrome.** plus action **Open System Settings** (and `log-in` / `dismiss`); stop the automation (do not poll for 15 minutes pretending success).
   - Open URL **only** with `open -a "Google Chrome" -- <url>`. If that exits non-zero, banner “Google Chrome is required for sign-in.”
   - Screenshot `/tmp/openbot-login.png`. Read it.
   - **Codex with `userCode`:** type via **System Events**, press Return, screenshot again, verify the page advanced.
   - **Claude paste-code:** only if M1 probe says paste is required (§ above).
   - **Allow / Continue / Authorize / Approve:** primary = AX locate the button in Chrome `AXWebArea`, then **CGEvent** click via `openbot-axclick`. Optional JS Apple Events / vision last. Screenshot after.
   - **Fail closed:** password / create-account page, or button not found → stop with actionable error **Sign-in page did not match. Finish in Chrome or try Log in again.** — do not guess.
   - `login.mjs` (dev) runs the same `open` + documents that full Allow automation is app-main’s job in M2+.
   - **Tests:** M2 `packages/app/e2e/login-ax.spec.ts` unit assertions use fake helper `packages/app/test/fakes/fake-axclick.sh` (prints the JSON errors; **no** Accessibility required on CI). Assertions: button-not-found → error JSON; title matcher Allow|Continue|Authorize|Approve; deny-accessibility path; does **not** call `cliclick`. Playwright projects: `ci` ignores `login-ax.spec.ts`; `local-ax` runs only that file (§5.5.5 / §9). **Real** `openbot-axclick` + Accessibility + Chrome = **M2b local-only** (ad-hoc package) and **M7** — re-grant permissions after each ad-hoc rebuild.
4. Show in-progress copy on the banner: **Finish sign-in in Google Chrome…** with a **Cancel** action that kills `loginPid` and re-emits `needs-login`.
5. Re-probe the shared credential files every 1s for **15 minutes**. On `logged-in`, kill the login child if still up, clear `loginPid`, push `login-finished {ok:true}`, set `harnessAuth[thatHarness]='logged-in'` and clear `needs-login` on **every** agent.
6. If no valid URL in 60s: kill the child, push `login-finished {ok:false, error:'no-url'}`, re-emit `needs-login` with message “Could not find a sign-in page. Try Log in again.”
6b. If 15 minutes elapse without `logged-in`, **or** the login child exits before credentials appear: kill the child if still up, push `login-finished {ok:false, error:'timeout'}` (child exit uses the same error), re-emit `needs-login` with message “Sign-in timed out. Try Log in again.”
6c. **M1 probe (stop-and-revise):** after a successful local Claude login into `CLAUDE_CONFIG_DIR=~/.openbot/claude-config`, run `claude auth status --json` with that env. If `loggedIn` is **`true`** while `.credentials.json` is missing (Keychain-only), **stop and revise** — do not keep the file-existence probe. Same inversion for Codex: if `codex login` reports success while `~/.openbot/codex-home/auth.json` is missing, stop and revise.
7. `scripts/dev/print-login-url.mjs` and `scripts/dev/login.mjs` are **created in M1**. `login.mjs` is a **WebSocket client**: connect with the admin token, send `harness.startLogin`, print the `login-challenge` URL (+ `userCode` when present), run `open -a "Google Chrome" -- <url>`. **Pin:** before any login click / `harness.startLogin` on macOS, `scripts/dev/login-screen-preflight.mjs` must exit 0 (Chrome window capture via `screencapture -l`, Accessibility, open-Chrome argv); wallpaper-only capture is Screen Recording denied for Cursor — never escalate as “human finish login in Chrome.” Ignore container sections of `e2e/computer-use/harness-login.md`.

**First-run login (no failed first message):** on empty team, if either harness is `logged-out`, show a team-level strip **Sign in to Claude Code or Codex to talk to agents** with **Log in** (sends `harness.startLogin` for the chosen harness — default Claude). On `agent.create` when `harnessAuth[activeHarness]==='logged-out'`, immediately push `needs-login` for that agent **before** any `chat.send`. Do not require a rejected first message to reveal login.

### Empty-state copy (M2)

Team column heading **Team**. Primary button **New agent**. Helper line: “Add someone, then give them work.” No “Start a chat.”

### Menu bar (v1)

**Tray (M2):** new file `packages/app/src/main/tray.ts`. `app.whenReady` creates `Tray` with `menubarTemplate.png` (22×22 template / black-on-transparent; pair with `menubar-unreadTemplate.png`, created in M2 by `scripts/fetch-harness-icons.sh` step 5). Context menu, in order: **Open** / **Pause all** / **Resume all** / **Quit** (same clicks as already specified — Quit is the only way to stop the daemon). Window close hides the window only.

**Title:** `{name} is browsing` when that agent has a Browser tab loading (main already knows views). Keep the existing “exactly one agent browsing” rule: title only when exactly one agent has a `WebContentsView` whose URL is not empty and not `about:blank`; else empty (icon only).

**Unread / attention icon:** **renderer is source of truth**. Preload IPC `unread.set { count: number }` whenever the attention-agent set size changes. An agent is in the set when any of: unread peer message while not selected; new visible assistant output while not selected; state `needs-you`; open actionable banner (`needs-login`, `needs-site`, `memory-error`). Main swaps `menubar-unreadTemplate.png` when `count > 0`, else the default. No daemon message. Export `getTrayUnread()` for tests.

**macOS notifications (when OpenBot is not the focused app):** main process fires a notification when an agent (a) needs an answer or permission (`needs-you`, `needs-site`, `needs-login`), (b) finishes a user-visible turn (`turn-finished` with `outcome:'complete'` while window unfocused / hidden), or (c) errors (`outcome:'error'` or `state:'error'`). Clicking the notification focuses the app and selects that exact agent/thread. If `Notification.isSupported()` is false **or** `Notification.show()` throws / permission denied: log `[notify] permission-denied` (or `unsupported`), rely on **tray attention only**, and show a one-time in-app tip **Notifications are off — use the menu bar icon for waiting agents.** Tests: single unit file `packages/app/src/main/tray-notify.test.ts` (no either/or e2e) — denied/unsupported path does not throw; click handler routes to the correct `agentId`. Wire Vitest in the app package: `packages/app/vitest.config.ts` + `"test": "vitest run"` in `packages/app/package.json` + a CI step that runs `pnpm --filter @openbot/app test` (alongside protocol/daemon). File path stays `packages/app/src/main/tray-notify.test.ts`.

### CI

In M0: rewrite CI filters from today’s `@botbox/protocol` / `@botbox/daemon` to `@openbot/protocol` (add `@openbot/daemon` only once that package exists); **delete** today’s `pnpm --filter @botbox/bot-image test` step and its `BOTBOX_IMAGE_TESTS` comment from `.github/workflows/ci.yml` (dead remote image filter). Keep protocol(+daemon) coverage on Ubuntu. In M2 **add** a Vitest step `pnpm --filter @openbot/app test` to the Ubuntu `test` job (**not** “or a sibling” — same job, extra step). App Playwright is a **second** job `app-e2e` on `macos-14` (M2, §9).

---

## 4. Folders and files on disk

```
~/.openbot/
  team.json                         { agents: AgentConfig[] }
  login-url                         Claude login URL (M1, overwritten)
  claude-config/                    shared Claude login (CLAUDE_CONFIG_DIR)
  codex-home/                       shared Codex auth.json
  hindsight/                        vendored/dev tree + data/ (empty first-use; Hindsight creates pg0)
    codex/                          isolated CODEX_HOME for Hindsight only
  agents/<slug>/
    role.md                         who they are
    MEMORY.md                       generated snapshot of durable facts (readable)
    workspace/                      their files
    browser-history.jsonl           { ts, url, title } one line per successful navigate (app-owned; skip in files pane)
  private/<slug>/
    thread.jsonl                    thread with you (daemon-owned; not in the files pane)
    browser-allow.json              string[] of allowed hosts (daemon-owned)
    sessions.json                   { 'claude-code': string|null, 'codex': string|null, lastInjectedSeq: { 'claude-code': number, 'codex': number } }
    spend.json                      { date: 'YYYY-MM-DD', usd: number }
    stopped-turn.json               interrupted-turn context for Resume continue (optional)
    browser-profile/                Chromium profile (private; write-denied)
    codex-home/                     config.toml (incl. request_user_input + hindsight MCP); auth.json copied on spawn; AGENTS.md written each turn
```

A may **read** `~/.openbot/agents/<other>/`. A may work elsewhere on the Mac. A **must not write** `~/.openbot/agents/<other>/` or OpenBot private/system paths. `~/.openbot/private/`, `team.json`, and `login-url` are denied to **all** Claude harness file tools (Read included). Codex write-deny matches the permission profile in §3.5; private paths are deny (including read) in that profile.

---

## 5. Protocol changes (`packages/protocol`)

Keep the package. Tests first (existing Vitest). Current tests: 68 in `packages/protocol/test/schemas.test.ts`. **M0 is one PR:** (1) npm package rename (`@botbox/protocol` → `@openbot/protocol`, root `botbox` → `openbot`, CI filters — §8 M0 step 1), then (2) strip + rename `Bot*`/`botId` → `Agent*`/`agentId` in types, files, and tests together. No half-rename of symbols; npm rename is a distinct numbered step before any `--filter @openbot/protocol` test run.

### 5.1 Strip (delete these files/fields — complete list)

| Remove | Where |
|---|---|
| `exitNodeEnabled`, `memoryLimitMb`, `cpus` | `src/domain/bot.ts` |
| `bot.setExitNode` | `src/messages/bot-set-exit-node.ts` + `index.ts` |
| `bot.setHumanControl` | `src/messages/bot-set-human-control.ts` + `index.ts` |
| `error.code: 'exit-node-offline'` | `src/domain/harness-event.ts` |
| `trustLabel`, `tailnetDns` | `src/domain/bot-runtime.ts` |
| entire `bot-context.ts` | Docker paths; replace with `AgentContext`: `{ agentId, workspaceDir, dataDir, sessionId, inFlightPid?, loginPid? }` (`sessionId` is the active harness session or `null`; per-harness ids live in `sessions.json`, not on this type). Delete `lastAutoCompactAt` — v1 has no auto-compact hook. |
| `humanControl.leaseExpiresAt` | **delete this key**; `humanControl` is `{ held: boolean }` only |
| banner `exit-node-offline`; actions `disable-exit-node` | `src/domain/daemon-event.ts` |
| `take-over` as a **banner** action | keep **Take over** on the browser pane only |
| `waiting-intervention` | `BotStateSchema` — replace with `needs-you` (**open AskUserQuestion card only**, not login) |
| `intervention.ts` + `intervention-opened` / `intervention-resolved` | old VNC cards + drop from `index.ts` |
| `routine.ts` + `TurnSource` `'routine'` | out of scope + drop from `index.ts` |
| `HealthReportSchema.cliVersion` | delete that field; keep `HealthReport` with `ok`, `harnessAuth`, `error?` |
| CI step `pnpm --filter @botbox/bot-image test` (+ `BOTBOX_IMAGE_TESTS` comment) | `.github/workflows/ci.yml` — delete that step in M0; rewrite remaining filters `@botbox/*` → `@openbot/*` |
| compaction / compacted `reason:'auto'` | `turn.ts` + `harness-event.ts` — keep `'harness-switch'|'manual'|'clear'`; reject `'auto'`; compaction + `compacted` `forHarness` become **optional** (omit on `clear`); HarnessEvent `compacted` **adds** required `partId: string` |
| `outcome` **part** type | `TurnPartSchema` in `turn.ts` — renderer uses `Turn.outcome` only |
| `harness.completeLogin` | **M0 keeps** the message and asserts it is present. M1 Claude paste-code probe may **delete** `src/messages/harness-complete-login.ts` + `index.ts` **and** update that M0 assertion in the **same PR** if paste is unreachable. Keep `harness.startLogin` either way. |

**Keep** banners: `needs-login`, `disk-warn`. **Add** banners: `needs-site`, `memory-error` (do **not** add `peer-rate-limit` — peer loop limit is removed). **Export** `BannerSchema` (and `Banner`) from `daemon-event.ts` and `packages/protocol/src/index.ts` — it is a module-private `const` today. Keep login-challenge / login-finished. Banner **actions** enum: drop `disable-exit-node` and `take-over`; keep `pause`, `resume`, `dismiss`, `log-in`; **add** `allow-site`, `deny-site`, `retry-memory`. Action `log-in` sends `harness.startLogin` with that banner’s `agentId` and `harness`. Action `retry-memory` re-runs Hindsight first-use init + spawn.

### 5.2 Rename + new messages

Files `bot.ts` → `agent.ts`, `bot-runtime.ts` → `agent-runtime.ts`, `bot-context.ts` → `agent-context.ts` (`AgentContext` as in §5.1). Types `BotConfig` → `AgentConfig`, field `botId` → `agentId` on Turn, Runtime, DaemonEvent, banners, **and both arms of `StreamEnvelope`** (`packages/protocol/src/domain/stream-envelope.ts`). DaemonEvent literal `kind:'bot-runtime'` becomes **`kind:'agent-runtime'`**. `BotGetResponseSchema` `{ config, runtime }` (no `ok` today) becomes `AgentGetResponseSchema` `{ ok:true, agent, runtime }` — field **`config` → `agent`**.

**`AgentConfig` model fields (locked):** add required `model: string`, optional `effort?: string`, optional `fast?: boolean`, required `memoryBankId: string` (UUID, set at create). **Do not** add `plan`. Defaults at create: Claude harness → `model: 'claude-sonnet-5'` (no `effort`); Codex harness → `model: 'gpt-5.6-luna'` plus that model’s default effort from the catalog when available. Sticky on that agent until changed. New message **`agent.setModel`** (create `src/messages/agent-set-model.ts`): `{ type:'agent.setModel', agentId, model: string, effort?: string }` → `{ ok:true, agent }` or `agent-not-found` / `busy` / `invalid-model`. **`invalid-model` (locked):** (1) `model` id is missing from that agent’s `agent.models` catalog → `invalid-model`; (2) `effort` is set and is not in that model’s `efforts` array → `invalid-model` (use **`invalid-model` for both**; do not invent `invalid-effort`). Claude `/effort` is intercepted and must write `AgentConfig.effort` via `agent.setModel { agentId, model: current, effort }` (same message). Claude effort levels: `low`, `medium`, `high`, `xhigh`, `max` (from Claude Code `/effort` docs). Disabled while thinking / needs-you / memorizing / compacting (same as harness switcher). On success rewrite that record in `team.json`. Claude `query()` passes `options.model`. If pinned SDK `sdk.d.ts` has `options.effort` (string), pass `AgentConfig.effort`. **Do not** invent a thinking-budget table. If there is no `effort` option, **stop and revise**. `turns.test.ts` asserts `options.effort` was passed when set. Codex argv uses `--model` plus `-c model_reasoning_effort=<effort>` when set (§3.5).

**`agent.models`** (create `src/messages/agent-models.ts`): `{ type:'agent.models', agentId }` → `{ ok:true, models: Array<{ id: string, displayName: string, efforts?: string[] }> }` or `agent-not-found`. The **renderer must not read the filesystem** for catalogs (same rule as files pane). Catalog sources:
- **Codex:** read `models_cache.json` from shared `~/.openbot/codex-home/models_cache.json` if present; else copy/fallback read `join(homedir(), '.codex/models_cache.json')` **for catalog only** (not auth). Hide entries with `visibility !== 'list'` and hide slug `codex-auto-review`. `efforts` = that model’s `supported_reasoning_levels[].effort`. If unreadable: return `{ ok:true, models: [{ id:'gpt-5.6-luna', displayName:'GPT-5.6-Luna', efforts:['low','medium','high','xhigh'] }] }` and log `[models] catalog-missing harness=codex`.
- **Claude:** file `packages/daemon/src/claude/models.json` created in M1 from https://code.claude.com/docs/en/model-config fetched that day (`id` + `displayName`). Each Claude model entry **includes** `efforts: ['low','medium','high','xhigh','max']`. If file missing: default `[{ id:'claude-sonnet-5', displayName:'Sonnet 5', efforts:['low','medium','high','xhigh','max'] }]`.
Picker uses `agent.models` only.

**Slash / daemon messages (busy = thinking / needs-you / memorizing / compacting → `{ok:false, error:'busy'}`; also `agent-not-found`):**
- **`agent.compact`** (`src/messages/agent-compact.ts`): `{ type:'agent.compact', agentId }` → `{ ok:true }` or `busy` / `agent-not-found` / `needs-login` (when `harnessAuth[activeHarness]==='logged-out'`). Runs the existing compact one-shot on the **current** harness (no switch). Inserts a visible assistant divider turn: `source:'compact'`, compaction part `{ type:'compaction', id, reason:'manual', forHarness: activeHarness }`, label **Context compacted**. Live: push `kind:'turn-created'` for that divider (not a mystery “divider” frame), then `compacted` with `partId` = that part’s `id`. Then continues as today’s compact recipe (§3.5 / §5.5.2).
- **`agent.clear`** (`src/messages/agent-clear.ts`): `{ type:'agent.clear', agentId }` → `{ ok:true }` or `busy` / `agent-not-found` (`needs-login` **not** required — clear still allowed). Visible divider: `source:'clear'`, `{ type:'compaction', id, reason:'clear' }` (**omit** `forHarness`), label **New conversation**. Live: push `kind:'turn-created'` only (`compacted` may be omitted — no model call). Then `sessions.json[activeHarness]=null` and `sessionId=null`. Keep `thread.jsonl`. Memory bank unchanged.
- **`agent.setFast`** (`src/messages/agent-set-fast.ts`): `{ type:'agent.setFast', agentId, fast: boolean }` → `{ ok:true, agent }` or `busy` / `agent-not-found`. Writes `AgentConfig.fast`. `/fast` sends this. Claude: SDK fast-mode option if present. Codex: Fast service tier from catalog if present. Else ignore and show overlay “Fast is not available for this model.”
- **`agent.skills`** (`src/messages/agent-skills.ts`): `{ type:'agent.skills', agentId }` → `{ ok:true, skills: Array<{ name: string, body: string }> }` or `agent-not-found`. Daemon scans (renderer does not read disk). **First wins** (do not override): (1) if harness `claude-code`: `~/.openbot/agents/<slug>/workspace/.claude/skills/*/SKILL.md` then `~/.claude/skills/*/SKILL.md`; (2) if `codex`: workspace `.codex/skills` then `~/.codex/skills`. Folder name = `name`. **Skip** names in: `model`, `effort`, `reasoning`, `compact`, `status`, `usage`, `context`, `mcp`, `init`, `fast`, `clear`. (No `/plan` — Plan mode is out entirely.)
- **`agent.rename`** (`src/messages/agent-rename.ts`): `{ type:'agent.rename', agentId, name: string }` → `{ ok:true, agent }` or `agent-not-found` / `invalid-name`. **Slug, folders, `CODEX_HOME`, Hindsight `memoryBankId` do not change.** Update `AgentConfig.name`, rewrite `team.json`, **and** rewrite the identity line in `role.md` (replace the leading `You are {oldName}` / title line with `You are {newName}` when present; if `role.md` has no such line, prepend `You are {newName}.\n`). Empty/whitespace → `invalid-name`.

**Turn parts** (add to `TurnPartSchema`): `peer-message` `{ type:'peer-message', id, peerAgentId, peerName, direction:'sent'|'received', text: string }`; `ask-user-question` `{ type:'ask-user-question', id, questions, status:'open'|'answered'|'cancelled', answers?: Record<string,string>, response?: string }` where `questions` is the §2.3 array (`question`, `header`, `options` of `{label, description}`, `multiSelect`). Zod validates **shape only** — do not reject on 1–4 / 2–4 / header length (the SDK already sent it). There is no `summary` field — `text` is the full body. Compaction part: `{ type:'compaction', id, reason:'harness-switch'|'manual'|'clear', forHarness?: string }` (`forHarness` optional; omit on clear). `TurnSource` add `'peer'`, `'clear'`, and `'resume-continue'`; keep `'memory-writer'`, `'compact'`, `'inject'`, `'harness-switch-compact'`; delete `'routine'`. Keep `Turn.errorCode` on the schema (renderer does not show it). `BotStateSchema` lives in `bot-runtime.ts` (not `bot.ts`); rename it there to `AgentStateSchema` with the rest of the `Bot*` types in that pass.

**`agent.create`** `{ type:'agent.create', name?: string, description?: string }`  
→ `{ ok:true, agent: AgentConfig }` or `{ ok:false, error:'invalid-name'|'slug-taken'|'need-name-or-description' }`  

At least one of `name` / `description` must be non-empty after trim; else `need-name-or-description`. If `name` is empty and `description` is set, derive a short display name: take the first 40 characters of the description’s first sentence (or first line), trim, and if empty fall back to `Agent`. Show that generated name in the modal before submit (editable). `AgentConfig.id` is a new UUID v4. `AgentConfig.memoryBankId` is a new UUID v4 (permanent bank id). `createdAt` is `new Date().toISOString()`. Folder key is `slug`. Every message’s `agentId` is that UUID; daemon looks up slug via `team.json`.

Slug: start from `name` if present else the derived display name. `normalize('NFKD').replace(/\p{M}/gu,'')` (so `José` → `Jose`), then lowercase, spaces→hyphens, then strip every character that is not `[a-z0-9-]`. Must match keep-as-is regex `^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$` (today `BotSlugSchema` in `packages/protocol/src/domain/bot.ts`; rename to `AgentSlugSchema`). Empty after strip → `invalid-name`. If longer than 48, truncate to 48 then re-check; still invalid → `invalid-name`. Collision → `slug-taken`. Default harness `claude-code`, default `model: 'claude-sonnet-5'`. Create:

```
~/.openbot/agents/<slug>/
  role.md            description or "You are {name}."
  MEMORY.md          empty
  workspace/
  browser-history.jsonl  empty
```

Also mkdir `~/.openbot/private/<slug>/` with `browser-profile/`, `codex-home/`, `thread.jsonl` (empty), `browser-allow.json` (`[]`), `sessions.json` `{ "claude-code": null, "codex": null, "lastInjectedSeq": { "claude-code": 0, "codex": 0 } }`, `spend.json` `{ "date": today, "usd": 0 }`. The **app** calls `session.fromPath` on that browser-profile path when the pane first opens.

Then **append** the new `AgentConfig` to `~/.openbot/team.json` `agents` and write the file. `agent.list` / slug lookup read this file.

**`agent.delete`** `{ type:'agent.delete', agentId }` → `{ ok:true }` or `agent-not-found` / `memory-delete-failed`. App shows confirm: **Delete {name}? This removes their conversation, private browser profile, Terminal sessions, folder files, and memory. This cannot be undone.** **App first:** if any right-pane tabs exist for that agent (M5+), close them all (destroy views / kill ptys) and `session.flushStorageData()` once on that agent’s session; **then** send `agent.delete`. Before M5 those calls are no-ops. Daemon order (locked): stop in-flight turn → **`DELETE /v1/default/banks/{memoryBankId}` first**. **HTTP 404** (bank never existed) → proceed with row/file delete. **Memory down / non-404 refuse** → `{ ok:false, error:'memory-delete-failed' }`, leave agent + folders intact, visible error — **do not** remove `team.json` or `rm -rf`. On DELETE **2xx** or **404** → remove that agent from `~/.openbot/team.json`, then `rm -rf` agent dir **and** `~/.openbot/private/<slug>/`. Tests: non-404 failure leaves agent present; 404 still deletes. Peer-message parts in **other** threads stay (history).

**`agent.list`** `{ type:'agent.list' }` → `{ ok:true, agents: Array<{ agent: AgentConfig, runtime: AgentRuntime, banners: Banner[] }> }`  
**`agent.get`** `{ type:'agent.get', agentId }` → `{ ok:true, agent, runtime, banners: Banner[] }` or `agent-not-found`. `banners` is the daemon’s current in-memory list for that agent (empty array if none). After `replayReset`, the app rebuilds banner UI from these fields (do not wait for a live push). Action `dismiss` hides that banner locally by `bannerId` and does **not** send a daemon message.

**`agent.files`** (create `src/messages/agent-files.ts`): `{ type:'agent.files', agentId }` → `{ ok:true, files: string[] }` or `agent-not-found`. Paths relative to the agent folder, in §6 order, with the §6 skip list already applied.

**`agent.readFile`** (create `src/messages/agent-read-file.ts`): `{ type:'agent.readFile', agentId, path }` → `{ ok:true, text }` or `agent-not-found` / `not-found` / `forbidden`. `path` is relative to the agent folder; reject `..`, paths outside that folder, and any path under `~/.openbot/private/` (`forbidden`). The files pane uses these two messages (renderer does not `fs.readFile` the agent folder).

**Turn model (TWO rows per you↔agent exchange; matches `TurnSchema` `role`):** the person’s words are never a `text` part on the assistant turn.

1. Every accepted `chat.send` **immediately** inserts a **user row** `{ role:'user', source:'user', parts:[{ type:'text', id, text:<raw typed text> }], harness omitted, costUsd omitted, outcome omitted }` and pushes `turn-created` (below). The bubble shows that raw text — **never** the `[user]` / `[peer]` prefixes.
2. If state is `idle` or `error`: the daemon **mints** the assistant `turnId` (`crypto.randomUUID()`) **before** spawning the harness, inserts the **assistant row** `{ id: that UUID, role:'assistant', source:'user', harness: activeHarness, parts:[] }`, pushes `turn-created` for it, and `chat.send` **returns immediately** with that `turnId`. `turn-started` then **fills** `sessionId` on that existing row (it does not insert a second row). If spawn fails, the binary is missing, or no first harness message arrives within **60s**: push `error` `fatal:true` `code:'cli-fatal'` `message` describing the failure, then `turn-finished` `outcome:'error'` `errorMessage` = that message; agent state `error`. Same path as `cli-fatal`.
3. If state is `thinking` / `needs-you` / `memorizing` / `compacting`: enqueue; `turnId` returned is the **visible in-flight assistant** (while `memorizing` / `compacting`, that is the just-finished visible assistant, not the hidden writer). Each queued send is already its own user-row bubble with a muted **Queued** tag (clears when the next assistant `turn-started` consumes it). When that turn finishes, harness input is the joined queue `[user]\n…\n---\n[user]\n…` and `[peer]\n…` — **harness-only**, not written back to `thread.jsonl` (peer `received` parts were already appended in §3.5). Concat cap 32_000 of that join; if over, **drop oldest** queued items. For each dropped user row: set `outcome:'error'` `errorMessage:'Not sent — too much queued text.'` and push `turn-finished` with `usage: { costUsd: null }` for that user `turnId` (this is the one case a user row carries `outcome`; renderer replaces **Queued** with that string, not the assistant **Something went wrong.** chrome). Then start a new assistant row (`source` per §3.5 step 4).
4. Renderer: `role:'user'` → your bubble. `role:'assistant'` → reasoning / tools / agent text / cards. Compact slice includes both roles (visible turns only). Renderer reads `Turn.outcome` on the assistant row (not an `outcome` part) for interrupted/error chrome.
5. Peer-started turns: **no** user row. One assistant turn `source:'peer'` whose parts **start with** `peer-message` `direction:'received'`. Push `turn-created` for that assistant row too.
6. Stop/pause/fatal: set `Turn.outcome` on the **assistant** row only.

**`chat.send`** (does **not** exist today — create `src/messages/chat-send.ts`):  
`{ type:'chat.send', agentId, text }` → `{ ok:true, turnId }` or `{ ok:false, error:'agent-not-found'|'paused'|'needs-login'|'text-empty' }`. If `text.trim() === ''`, return `text-empty` (do not insert a row). Composer **Send** is disabled while the field is empty or whitespace.  
Enqueue when state is `thinking`, `needs-you` (open card), `memorizing`, or `compacting`. Start the two-row sequence when `idle` or `error`. Reject when `paused`. Reject with `needs-login` when `runtime.harnessAuth[activeHarness] === 'logged-out'` — login is **not** the `needs-you` state. On that rejection the daemon pushes (or re-pushes) the `needs-login` banner for that agent with `harness = activeHarness`; the app leaves the typed text in the composer (do not clear the field, do not insert a user row).

**`chat.history`** (create `src/messages/chat-history.ts`): `{ type:'chat.history', agentId, sinceSeq?: number, limit?: number }` → `{ ok:true, turns: Turn[], lastEnvelopeId: number }` or `agent-not-found`. `lastEnvelopeId` is the daemon’s current global envelope counter (the same `StreamEnvelope.id` space). After applying those turns, the app **ignores** later envelopes for that agent whose `id <= lastEnvelopeId`. Default last **50** visible turns; `limit` clamp 1–200. Hidden turns are omitted unless `sinceSeq` is set (then include hidden in that seq range so inject/compact rows can be skipped by the UI). See §5.3 for `thread.jsonl`.

**`ask.answer`** (create `src/messages/ask-answer.ts`): `{ type:'ask.answer', agentId, partId, answers: Record<string,string>, response?: string }` → `{ ok:true }` or `not-open` / `agent-not-found`. Multi-select: join labels with `", "` (official AskUserQuestion docs).

Rename today’s files (no “or”): `bot-get.ts` → `agent-get.ts`, `bot-pause.ts` → `agent-pause.ts`, `bot-resume.ts` → `agent-resume.ts`, `bot-set-harness.ts` → `agent-set-harness.ts`. `chat-stop.ts` stays `chat.stop` but `botId` → `agentId` and error `'bot-not-found'` → `'agent-not-found'`. Same `botId` → `agentId` and `'bot-not-found'` → `'agent-not-found'` on `harness-start-login.ts`, `agent-pause.ts`, `agent-resume.ts`, and `agent-set-harness.ts`. **`harness.startLogin` error enum** becomes `['busy','already-logged-in','agent-not-found','bad-state']` (delete `'login-busy'` and `'harness-busy'`; M0 tests reject those two). Do **not** add `agentId` to `event-stream.ts` (it has none today; envelopes already carry `agentId`). Delete `bot-set-exit-node.ts` and `bot-set-human-control.ts`. **M0 keeps** `harness-complete-login.ts`. Delete it only after the Claude paste probe (same PR as assertion update). Create: `src/messages/agent-create.ts`, `agent-delete.ts`, `agent-list.ts`, `agent-files.ts`, `agent-read-file.ts`, `agent-set-model.ts`, `agent-models.ts`, `agent-compact.ts`, `agent-clear.ts`, `agent-set-fast.ts`, `agent-skills.ts`, `agent-rename.ts`, `chat-send.ts`, `chat-history.ts`, `ask-answer.ts`, `browser-exec.ts`, `browser-set-human-control.ts`, `browser-allow-site.ts`, `terminal-read.ts`, `terminal-run.ts`. **Do not** create `agent-set-plan.ts`. Keep and **export** `EventStreamMetaSchema` from `event-stream.ts` and `packages/protocol/src/index.ts`. Delete `harness-complete-login.ts` only after the Claude paste probe says so.

**`peer.send` is not a client RPC.** It is the daemon function `message_agent` calls. **M1 implements it.** M4 is the app showing **Messaged B** / **Message from B**.

**`agent.setHarness` / `pause` / `resume`:** same shapes as today’s `bot.*` files after rename, except `agent.setHarness` error `'harness-switch-busy'` becomes **`'busy'`** (delete the old literal; M0 tests reject `'harness-switch-busy'`). If state is `thinking` / `needs-you` / `memorizing` / `compacting`, return `{ok:false, error:'busy'}` and **do not** flip. If `harnessAuth[toHarness] === 'logged-out'`, return `{ok:false, error:'needs-login'}`, push `needs-login` with `harness = toHarness`, **do not** flip. On success, set `AgentConfig.harness` (that field **is** `activeHarness` everywhere in this plan) and **rewrite** that record in `~/.openbot/team.json`. `compact-failed` stays on the old harness. **`agent.pause` interrupts the in-flight turn** (including a pending `needs-site` op) and rejects new `chat.send` until `agent.resume`. It does not only “wait until the current turn ends.”

**Daemon→app requests** (same framing, `id` UUID; the **app** replies). Needed so a harness can drive the in-app browser and read the Terminal buffer:

`terminal.read` (`src/messages/terminal-read.ts`): `{ type:'terminal.read', agentId }` → `{ ok:true, text: string }` or `no-terminal` / `unknown-agent`. If no app connected: daemon waits **30s** then MCP fails with `no-app` (same as `browser.exec`). **Who holds the buffer:** Electron **main** (`packages/app/src/main/terminal-pty.ts`) keeps `Map<tabId, { agentId, ring: string, lastWrittenAt?: number, lastFocusedAt?: number }>` — last **8000** chars of pty output. The **pty `data` handler stamps `lastWrittenAt = Date.now()`** on every chunk written into the ring. Renderer sends preload IPC `terminal.focus { agentId, tabId }` when the user selects a Terminal tab **or** clicks a matching tool row (app-local); **`terminal.focus` stamps `lastFocusedAt`**. Read order: latest `lastWrittenAt`, then latest `lastFocusedAt`, else `no-terminal` **only** when that agent has **no** Terminal tabs. MCP `terminal_read` forwards to this request.

`terminal.run` (daemon→app, create `src/messages/terminal-run.ts`): `{ type:'terminal.run', agentId, command, cwd?, timeoutMs?, tabId?, stealFocus:false }` → `{ ok:true, tabId, exitCode, output }` or `{ ok:false, error:'no-app'|'unknown-agent'|'write-denied'|'timeout'|'interrupted'|'op-failed' }`. Creating/running **never** steals focus (`stealFocus` always false). MCP `shell_run` forwards here; model-facing output capped at **32_000** chars.

`browser.exec` `{ type:'browser.exec', agentId, allowedHosts: string[], op, ... }` — discriminated on `op`. `allowedHosts` is the daemon’s snapshot of `browser-allow.json` (full lowercase hostnames). The app checks **that array**, not the file. App runs it on that agent’s `WebContentsView`. Errors the **app** may return: `human-control-held` | `unknown-agent` | `unknown-ref` | `cross-site` | `nav-failed` | `op-failed`. `nav-failed` carries `{ errorCode, errorDescription }` from Electron `did-fail-load`. `op-failed` is `executeJavaScript` / `capturePage` reject. `navigate` settles on `did-finish-load` **or** `did-fail-load`, with an app-side cap of **30s**, then clears `agentOpInFlight`. If no app is connected (socket drop), the daemon waits **30s** then fails the MCP tool with `no-app`. `needs-site` is a **daemon** error (the app does not return it). On `cross-site`, the app also returns `{ url, host }` so the daemon can store a pending **navigate** to that URL.

| `op` | Request fields | App does | `result` on ok |
|---|---|---|---|
| `navigate` | `{ url: string }` (plus the common `allowedHosts`) | `webContents.loadURL(url)`; append `{ ts, url, title }` to `browser-history.jsonl` | `{ url, title }` |
| `snapshot` | `{}` | See snapshot algorithm below | `{ yaml: string }` |
| `click` | `{ ref: string }` | `executeJavaScript` of an IIFE (top-level `return` is a syntax error): `(() => { const el = document.querySelector('[data-openbot-ref="'+CSS.escape(ref)+'"]'); if (!el) return false; el.click(); return true })()` — **not** `sendInputEvent`. App maps `false` → `{ ok:false, error:'unknown-ref' }` | `{ url, title }` |
| `type` | `{ ref: string, text: string }` | Same IIFE + `querySelector` as `click`. Missing node → `{ ok:false, error:'unknown-ref' }`. Else focus the node. Set value with `Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, text)` (textarea: `HTMLTextAreaElement.prototype`). Then dispatch `input`, `change`, and `blur` (bubbles). If `el.isContentEditable`, set `textContent` and dispatch `new InputEvent('input',{bubbles:true,data:text,inputType:'insertText'})`. Do **not** assign `.value =`. | `{ url, title }` |
| `screenshot` | `{}` | `webContents.capturePage()` → PNG base64 | `{ pngBase64: string }` |

The MCP tool `browser_screenshot` does **not** return that JSON as text. It returns one MCP content block `{ type:'image', data: pngBase64, mimeType:'image/png' }`.

**Snapshot algorithm** (exact, in `executeJavaScript` as an IIFE that **returns** the YAML string — same wrap as `click`):

1. Remove every existing `data-openbot-ref`.
2. Query `a, button, input, textarea, select, [role]`.
3. Keep a node only if `el.getClientRects().length > 0`.
4. Stamp `data-openbot-ref="e1"`, `e2`, … in document order.
5. `role` = `el.getAttribute('role')` or the lowercase tag name.
6. `name` = `aria-label`, else `innerText` (or `value` for inputs), trimmed to 80 characters.
7. Return YAML, one map per element, exact shape:

```
- role: button
  name: Allow
  ref: e1
- role: a
  name: Learn more
  ref: e2
```

Refs die on every navigate and every new snapshot. Missing or stale `ref` → `{ ok:false, error:'unknown-ref' }`.

Human URL-bar navigations and back/forward **also** append `{ ts, url, title }` to `browser-history.jsonl` (same file the address bar suggests from via main-process `history.suggest` — renderer must not read disk). The **app** writes `browser-history.jsonl`; the **daemon** writes `browser-allow.json`.

**Browser chrome preload IPC names (locked — M5 implements `Chrome.tsx` + views):**
- `browser.navigate { tabId, url }`
- `browser.back { tabId }`
- `browser.forward { tabId }`
- `browser.reload { tabId }`
- `browser.setBounds { agentId, tabId, rect }`

Main↔renderer daemon IPC remains preload `daemon.request` / `daemon.onEvent` (WebSocket in main).

Harness MCP tools `browser_navigate` / `browser_click` / `browser_type` / `browser_screenshot` / `browser_snapshot` (registered in **M5**) forward to `browser.exec`. MCP `terminal_read` (also M5) forwards to daemon→app `terminal.read` (not `browser.exec`). Host matching: store and compare the **full lowercase hostname** (strip trailing dot and port). **No** public-suffix / “registrable domain” reduction (do not add `tldts` or `psl`). An allow entry `example.com` matches `example.com` and `www.example.com` (host === entry or host ends with `'.'+entry`). It does **not** match `notexample.com`.

Daemon checks the host on `navigate` **before** sending `browser.exec`. The app sets `agentOpInFlight = true` when it **begins** handling a `browser.exec` and clears it when that op’s reply is sent. For `click` only: do **not** reply when `el.click()` returns; wait until `did-finish-load` **or** 2000ms, whichever first, then reply with `{ url, title }` as of that moment, then clear the flag. (A cross-site navigation from the click is therefore still gated.) The **app** also listens for Electron `will-navigate` and `will-frame-navigate` while `agentOpInFlight` is true. Both listeners are **one argument**: `(event) => { const url = event.url }`. If the destination host is not in that request’s `allowedHosts` (same suffix rule as §5.2): `event.preventDefault()`, finish the in-flight `browser.exec` with `{ ok:false, error:'cross-site', url, host }`. Daemon stores **one** pending op `{ op:'navigate', url }` (not a replay of the click) and uses the same `needs-site` banner path as a blocked `navigate`. Human-driven navigations (human control held, or URL bar) leave `agentOpInFlight` false and skip this gate.

If the host is not allowed on `navigate`: daemon does **not** send `browser.exec`. It stores **one** pending op per `agentId` (in daemon memory). The MCP tool waits until `browser.allowSite` (window close keeps waiting). To make that wait survive harness timers: Claude Agent SDK `mcpServers.openbot` = `{ type:'http', url, timeout: 3600000, alwaysLoad: true }` (`alwaysLoad` keeps peer/browser tools in the first prompt; SDK 0.3.231). Keep `timeout`: it is on `McpHttpServerConfig` in `@anthropic-ai/claude-agent-sdk@0.3.231` `sdk.d.ts` (`timeout?: number`, “Per-server tool-call timeout in milliseconds. Overrides the MCP_TOOL_TIMEOUT environment variable for this server.”). The public Agent SDK *docs* omit the field; the type file is the source. Values below 1000ms are ignored. SDK `options.env` **replaces** the subprocess env — pass `{ ...process.env, CLAUDE_CONFIG_DIR, MCP_TIMEOUT:'3600000', MCP_TOOL_TIMEOUT:'3600000', CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT:'0', CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS:'0' }` (docs: connection / overall tool wait). Do **not** pass an object with only those keys. Codex `tool_timeout_sec = 3600` in the TOML above. If Claude still backgrounds the call at two minutes, keep the pending op; when `allowSite` completes, return the MCP result — do not fail the site ask. Push banner `needs-site`. A second browser tool while one ask is open returns `site-ask-open` immediately (do not queue). Stop or `agent.pause` fails the pending op with `needs-site` and unblocks the tool.

**`browser.allowSite`** (create `src/messages/browser-allow-site.ts`, **app→daemon**): `{ type:'browser.allowSite', agentId, host, allow: boolean }` → `{ ok:true }` or `agent-not-found` / `not-open`. `allow:true` appends that **full hostname** to `browser-allow.json` and then sends the pending `browser.exec` (always a `navigate` to the stored URL). `allow:false` fails that pending op with `needs-site`. Banner actions `allow-site` / `deny-site` send this message.

Human **take control** (click or button): app sends `browser.setHumanControl` `{ type:'browser.setHumanControl', agentId, held:true }`; **Return control** `{ held:false }`.

### 5.3 AskUserQuestion on the wire

Permission mode: Agent SDK **`default`** (not `bypassPermissions`, not `dontAsk`). Main turns omit `tools` (SDK default includes `AskUserQuestion`). `canUseTool`: if `toolName === 'AskUserQuestion'`, wait for `ask.answer`; **else** immediately `{ behavior:'allow', updatedInput: input }`. There is **no** per-tool approval card in v1. PreToolUse is the write-deny gate (§3.5). Official docs: AskUserQuestion still reaches the callback even when an allow rule matches; `dontAsk` denies it. **M1 probe** (`packages/daemon/scripts/ask-probe.mjs`, run after `smoke.mjs` against real `claude` on this Mac): (1) On the `system` / `init` message, assert the `tools` array contains a tool whose `name` is `AskUserQuestion`. If it is missing, **stop and revise** (SDK default set changed) — do not retry. (2) Send this exact user text (permissionMode `default`): `Ask me one question using the AskUserQuestion tool: "Ship today or tomorrow?" with two options labelled "Today" and "Tomorrow". Do not answer in prose. Call the tool.` (3) Pass = `canUseTool` fires with `toolName === 'AskUserQuestion'`. If the model answers in prose without calling the tool, retry the same prompt as a **new** turn, up to **3** attempts total. After 3 misses, **stop and revise** — do not ship M3 on a guess. A run where init lists the tool but the model never calls it is a miss, not a skip.

App → daemon: **`ask.answer`** `{ type:'ask.answer', agentId, partId, answers: Record<string,string>, response?: string }` → `{ ok:true }` or `not-open` / `agent-not-found`. Claude: that unblocks `canUseTool`. Codex: that writes the tool result to the waiting child’s **stdin** (§3.5) so the turn continues.

Live delivery: extend `HarnessEvent` with `kind:'turn-created'` `{ turnId, seq, role, source, createdAt: string, harness?: string, text?: string }` (`createdAt` = ISO now; push only for **visible** turns — `hidden` absent or false. Never push when `hidden:true`. `text` is the user-row body when `role:'user'`). Also `kind:'peer-message'`, `kind:'ask-user-question'`, and `kind:'ask-user-question-status'` `{ partId, status:'answered'|'cancelled' }` (push this when `ask.answer`, Stop, or pause resolves a card so the window can dim it). Extend HarnessEvent **`compacted`**: `{ kind:'compacted', partId: string, reason: 'harness-switch'|'manual'|'clear', forHarness?: string }` (reject `'auto'`; `forHarness` optional). `applyEvent` on `compacted` upserts a compaction part with that `partId`. **`turn-finished` gains** required `outcome: 'complete'|'interrupted'|'error'` and optional `errorMessage?: string`. **`usage` stays required** with shape `{ costUsd: number | null, inputTokens?: number, outputTokens?: number, contextWindow?: number }` and the schema **is always** `.strict()` (always reject unknown usage keys — no “if”). The `costUsd` **key is always present**; value is **`null` when unknown** (Claude: null when not finite; Codex: null when the probe has no cost). Do **not** omit the key. Persist **`Turn.costUsd` = last finished `usage.costUsd`** (nullable). Snapshot recall **4000** vs turn-start recall **1024** is deliberate (§5.5.1). Stop/pause → `interrupted` (no `errorMessage`). Fatal harness `error` → `error` and `errorMessage` = that event’s `message`. Success → `complete`. `sessionId` stays required: use the harness session, or `''` for a dropped queued **user** row (that row has no session). Dropped queued user `turn-finished` uses **`usage: { costUsd: null }`**. The renderer copies outcome/usage onto the matching `Turn` (not via `applyEvent`, which only folds parts). Other kinds: fields match the turn parts except the id is **`partId`** (not `id`). StreamEnvelope channel remains `harness`. Do **not** fake cards via deleted intervention events. On `ask.answer`, `canUseTool` returns `{ behavior:'allow', updatedInput:{ questions, answers, response } }` (`response` inside `updatedInput`, not beside it).

On Quit with an open card: same modal as §3.5 (**Open OpenBot** / **Stop and quit**). Do **not** return `defer` from `canUseTool` (allow / deny only). The official `defer` **hook** exists; we do not wire it in v1. Persist the card in `thread.jsonl`. Window close: callback keeps waiting (daemon + menu bar stay up).

Stop or pause while open: `{ behavior:'deny', message:'User stopped' }`; part `status:'cancelled'`; turn `interrupted`.

Do not implement the unofficial CLI `control_request` protocol.

**History:** `chat.history` shape is §5.2 (includes `limit?`). `thread.jsonl` lives at `~/.openbot/private/<slug>/thread.jsonl` (not in the agent folder). It is the on-disk copy of the in-memory turn list. Write `thread.jsonl.tmp` then `rename` over `thread.jsonl` (atomic). Each `turnId` appears on **exactly one** line; never append a second line for the same id. `seq` is monotonic. **When to rewrite:** on turn insert, on `turn-finished` (outcome + cost), on card `status` change, and **at most once every 500 ms** while parts are concatenating. Always flush (rewrite now, ignore the 500 ms timer) **before** the memory retain+snapshot starts and **before** daemon exit. On daemon start: parse each line as a `Turn`; ignore a torn last line; if two lines share a `turnId` (should not happen after the rename rule), last line wins. `chat.history` reads the in-memory list (same contents as the file after the last rewrite).

**On-disk config:** `~/.openbot/team.json` = `{ agents: AgentConfig[] }` (full records, not ids only). `role.md` on disk is the source of truth. **Strip `roleMd` from `AgentConfig` in M0** (role lives only in `role.md`). M0 test **rejects** `roleMd` on config. M6 is a read-only viewer of `role.md`. Harness lives on `AgentConfig` in `team.json`.

**Unallowed site:** daemon banner `type:'needs-site'` `{ kind:'banner', bannerId, agentId, type:'needs-site', host, message: 'Allow '+host+'? This agent wants to open it.', actions:['allow-site','deny-site'] }` — **not** a fake AskUserQuestion.

**Peer bounce:** **none** — no six-per-hour counter, no auto-pause, no `peer-rate-limit` banner. Extra ask before submit/purchase: **out of v1**.

**`browser.setHumanControl`** `{ type:'browser.setHumanControl', agentId, held: boolean }` → `{ ok:true, held }` or `agent-not-found`. Daemon owns `runtime.humanControl.held`. Human `before-mouse-event` mouseDown sends `{ held:true }` (preempt). Only `{ held:false }` from **Return control** releases. `browser.exec` while pane closed / no Browser tab: app **creates** the `WebContentsView` on the existing BrowserWindow; if the window is **visible**, also add a visible Browser tab and make it frontmost; if the window was **hidden**, do **not** `show()` (§3.5 Hidden window). Error string **`human-control-held`**.

**Codex isolation:** Claude uses PreToolUse. Codex uses the M1b probe-proven sandbox/policy (§3.5) so it can work elsewhere on the Mac while denying writes to other agents’ folders and OpenBot private paths. Peer tools: same MCP HTTP URLs. M1b writes the full `config.toml` in §3.5. `browser_*` in **M5**.

**`queueCount`:** integer on runtime = number of queued `chat.send` texts plus queued peer texts for that agent (0 when idle). **`talkingToAgentId`:** **Add** `string | null` on runtime (it is **not** on today’s `BotRuntimeSchema`). On a successful `message_agent`, set it on **both** A (sender) and B (receiver). Clear each to `null` at that agent’s next `turn-finished`. Keep the field (used elsewhere); the **sidebar row does not show** “talking to …”. M0: assert the field exists and accepts `null`.

**`contextUsed` / `contextWindow`:** `number | null` on `AgentRuntime`. Set from the last finished turn’s usage (Claude SDK tokens + `models.json` window; Codex JSONL tokens + catalog `context_window`). Push `agent-runtime` when they change. Mid-turn the donut shows **last finished** values (or null → empty ring).

**`sessionId` on runtime:** `string | null` — the active harness session (same value as `AgentContext.sessionId`). **`mcp` on runtime:** `Array<{ name: 'openbot' | 'hindsight', url: string, last: 'ok' | 'fail' | null }>`. **URLs never include tokens** (MCP tokens stay daemon-memory-only). openbot url = `http://127.0.0.1:${OPENBOT_PORT}/mcp/${agentId}` (no query). hindsight url = `http://127.0.0.1:${hindsightPort}/mcp/${memoryBankId}/` (trailing slash; never the slug). `last`: daemon sets `'ok'` or `'fail'` after that server handles a request; `null` until then. Push `agent-runtime` when `mcp` / `sessionId` change. `/status` `/usage` `/context` overlay reads spend + donut + `sessionId` from the selected agent’s runtime. `/mcp` overlay lists `runtime.mcp` (name, url, last). Do **not** send tokens to the renderer.

**Spend:** `spendUsdToday` on runtime (calendar day in local TZ). Persist `~/.openbot/private/<slug>/spend.json` as `{ "date":"YYYY-MM-DD", "usd": number }`. On daemon start, if `date` is today, load `usd`; else `{ date: today, usd: 0 }`. **Before** adding a `costUsd` (and on a 60s timer while the daemon is up): if `spend.json.date` is not today, replace the file with `{ date: today, usd: 0 }` first, then add. The always-on daemon therefore rolls over at midnight without a restart. `turns.test.ts` asserts: load a file dated yesterday, finish a turn, file date is today and `usd` equals that turn’s cost only.

**Harness switcher:** enabled when state is `idle`, `paused`, or `error`. Disabled with tooltip “Wait until this turn finishes.” when `thinking`, `needs-you`, `memorizing`, or `compacting`. Daemon `agent.setHarness` in those four busy states returns `{ok:false, error:'busy'}` and does not flip. From `paused`: switch is allowed; after successful compact/inject (or empty-slice flip), run **post-switch continue** (§3.5) so the agent does **not** stay paused. Compact/inject/continue may spend money. Failure rolls back to the old harness and prior `paused` state.

**Prompt files:** `packages/daemon/src/memory/memory-snapshot-recipe.md` (retain+snapshot; §5.5.1) and `packages/daemon/src/harness/compact-prompt.md`. Delete any `memory-writer-prompt.md` Haiku one-shot.

Window close (not Quit): callback keeps waiting (daemon + menu bar stay up).

### 5.4 Peer errors (no loop limit)

`message_agent` returns `{ ok:true }` on success (A’s model sees that JSON). `{ ok:false, error }` for: `not-found`, `self`, `paused`, `needs-login`. **Do not** return `rate-limited`. **Do not** implement a peer-loop counter, auto-pause, banner, schema, tests, or copy for bouncing work.  
If B is on an open AskUserQuestion, inbound peer messages **enqueue** and are delivered by the normal end-of-turn path in §3.5 once the card is answered or Stopped (so they never wait on a `turn-finished` that cannot arrive).

### 5.5 Create, don’t “reuse missing files”

| Artifact | When | Exact |
|---|---|---|
| `packages/daemon/` | M1 | new package `@openbot/daemon` — tree in §5.5.4 |
| `packages/daemon/src/memory/memory-snapshot-recipe.md` | M1 | retain+snapshot recipe in §5.5.1 (Haiku writer gone) |
| `packages/daemon/src/memory/hindsight-client.ts` | M1 | HTTP client for retain/recall; tests use a fake |
| `packages/daemon/src/memory/hindsight-spawn.ts` | M1 | `spawnHindsight({ spawnFn, home, port })` |
| `packages/daemon/src/memory/hindsight-pin.json` | M1 | python + hindsight-all 0.9.0 + model ids + sha256 of **entire** `resources/hindsight/` tree (§5.5.8) |
| `scripts/dev/bundle-hindsight.sh` | M1 | Authoritative extraResources recipe (§5.5.8) |
| `scripts/dev/setup-hindsight.sh` | M1 | Thin wrapper around §5.5.8 with `DEST=$HOME/.openbot/hindsight`; not the only path |
| `resources/hindsight/` | M1/M2b | Output of bundle script; electron-builder `extraResources` source |
| `packages/daemon/src/claude/models.json` | M1 | Claude catalog from model-config docs that day |
| `packages/daemon/src/memory/preamble.md` | M1 | body in §5.5.6 |
| `packages/daemon/src/memory/preamble-browser.md` | M5 | extra paragraph in §5.5.6 |
| `packages/daemon/scripts/ask-probe.mjs` | M1 | procedure in §5.3 |
| `packages/daemon/src/harness/compact-prompt.md` | M1 | body in §5.5.2 |
| `packages/app/` | M2 | Electron via **electron-vite** (not Tauri) — tree in §5.5.5 |
| `scripts/fetch-harness-icons.sh` | M2 | recipe in §5.5.3 (harness SVGs **and** menu bar PNGs) |
| `scripts/render-menubar-icons.swift` | M2 | exact body in §5.5.3 step 5 |
| `scripts/dev/print-login-url.mjs` | M1 | writes argv URL to `join(process.env.OPENBOT_HOME, 'login-url')` then exits 0 |
| `packages/daemon/test/fixtures/login/*.txt` | M1 | Capture stdout from one real `claude auth login` and `codex login --device-auth` first. If no URL appears in the `BROWSER` file **or** stdout, **stop and revise** — do not invent a pty or scrape a config file. Do **not** copy from the old plan. |
| `scripts/dev/login.mjs` | M1 | WS client: `harness.startLogin` + print URL + `open -a "Google Chrome"` |
| `packages/app/src/native/openbot-axclick.swift` | M2 (source) / M2b (into Helpers) | Allow-click helper — §5.5.7 (one path; no Helpers/ Swift fork) |
| `packages/app/helpers/openbot-axclick` | M2 build step / M2b afterPack | Binary from §5.5.7 `swiftc` **before** `login-ax.spec.ts` |
| `packages/app/test/fakes/fake-axclick.sh` | M2 | Fake helper for `login-ax.spec.ts` unit assertions (CI; no Accessibility) |
| `packages/app/src/main/login-ax.ts` | M2 | `resolveAxclickPath()` + Allow automation |
| `packages/app/electron-builder.yml` | M2b | Packager config — full body in §8 M2b (`appId: com.openbot.app`) |
| `packages/app/build/entitlements.mac.plist` | M2b | Full body in §8 M2b (apple-events + Electron JIT; **no** sandbox) |
| `packages/app/scripts/after-pack.cjs` | M2b | Full body in §8 M2b — copy helper → `Contents/Helpers/openbot-axclick` |
| `packages/app/package.json` `electron-builder` | M2b | Pin latest **26.x** that day (verified 2026-08-14 npm: `26.15.7`) |
| `packages/app/package.json` `@electron/rebuild` | M5 | Pin latest **4.x** that day (verified 2026-08-14 npm: `4.2.0`); `postinstall`: `electron-rebuild -f -w node-pty` |
| `packages/app/src/main/arch.ts` | M2 | `isAppleSilicon()` — §3.5 Arch |
| `packages/app/src/main/arch.test.ts` | M2 | Vitest for arch gate |
| `packages/app/vitest.config.ts` | M2 | App unit tests (`tray-notify`, `arch`) |
| `packages/app/playwright.config.ts` | M2 | Projects `ci` (ignore login-ax) + `local-ax` (only login-ax); §9 uses `ci` |
| `packages/app/e2e/login-ax.spec.ts` | M2 fixtures / M2b+M7 real | Fake helper on CI; real binary local-only after ad-hoc rebuild + re-grant |

#### 5.5.7 openbot-axclick (Swift helper — exact)

**One path (locked):** source is **only** `packages/app/src/native/openbot-axclick.swift`. **No** `Helpers/` fork of the Swift source.

**Build:**
```
swiftc -O -o packages/app/helpers/openbot-axclick packages/app/src/native/openbot-axclick.swift
```

**Resolver** `resolveAxclickPath()` in `packages/app/src/main/login-ax.ts`:
- Packaged: `join(process.resourcesPath, '..', 'Helpers', 'openbot-axclick')` (i.e. `Contents/Helpers/openbot-axclick`)
- Else (dev): repo `packages/app/helpers/openbot-axclick`

**CLI:** JSON on stdin **or** argv JSON: `{ "pid"?: number, "titles": ["Allow","Continue","Authorize","Approve"] }` → walk Chrome `AXWebArea` for `AXButton` with matching title → **CGEvent** click center → print JSON `{ "ok": boolean, "error"?: string }` to stdout → exit `0` if ok else `1`.

**Packaged (M2b):** `afterPack` copies `packages/app/helpers/openbot-axclick` → `Contents/Helpers/openbot-axclick` (ad-hoc signed with the app). Developer-ID resign is a follow-on.

**No `cliclick`.**

**Complete Swift body** (paste into `packages/app/src/native/openbot-axclick.swift`):

```swift
import AppKit
import ApplicationServices
import Foundation

struct Request: Decodable {
  var pid: Int32?
  var titles: [String]
}

struct Response: Encodable {
  var ok: Bool
  var error: String?
}

func emit(_ response: Response, code: Int32) -> Never {
  let data = try! JSONEncoder().encode(response)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write(Data([0x0a]))
  exit(code)
}

func readRequest() -> Request {
  if CommandLine.arguments.count > 1 {
    let raw = CommandLine.arguments[1]
    guard let data = raw.data(using: .utf8),
          let req = try? JSONDecoder().decode(Request.self, from: data) else {
      emit(Response(ok: false, error: "bad-argv"), code: 1)
    }
    return req
  }
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard let req = try? JSONDecoder().decode(Request.self, from: data) else {
    emit(Response(ok: false, error: "bad-stdin"), code: 1)
  }
  return req
}

func chromePid(preferred: Int32?) -> pid_t? {
  if let preferred { return preferred }
  let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.google.Chrome")
  return apps.first?.processIdentifier
}

func titleMatches(_ value: String?, titles: [String]) -> Bool {
  guard let value else { return false }
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  return titles.contains { $0.caseInsensitiveCompare(trimmed) == .orderedSame }
}

func walk(_ el: AXUIElement, titles: [String]) -> AXUIElement? {
  var role: CFTypeRef?
  AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
  let roleStr = role as? String
  if roleStr == (kAXButtonRole as String) {
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &title)
    if titleMatches(title as? String, titles: titles) { return el }
  }
  var children: CFTypeRef?
  let err = AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &children)
  guard err == .success, let arr = children as? [AXUIElement] else { return nil }
  for child in arr {
    if let hit = walk(child, titles: titles) { return hit }
  }
  return nil
}

func clickCenter(_ el: AXUIElement) -> Bool {
  var pos: CFTypeRef?
  var size: CFTypeRef?
  guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos) == .success,
        AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size) == .success else {
    return false
  }
  var point = CGPoint.zero
  var rectSize = CGSize.zero
  AXValueGetValue(pos as! AXValue, .cgPoint, &point)
  AXValueGetValue(size as! AXValue, .cgSize, &rectSize)
  let x = point.x + rectSize.width / 2
  let y = point.y + rectSize.height / 2
  guard let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown,
                           mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left),
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp,
                         mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left) else {
    return false
  }
  down.post(tap: .cghidEventTap)
  up.post(tap: .cghidEventTap)
  return true
}

let req = readRequest()
if !AXIsProcessTrusted() {
  emit(Response(ok: false, error: "accessibility-denied"), code: 1)
}
guard let pid = chromePid(preferred: req.pid) else {
  emit(Response(ok: false, error: "chrome-not-found"), code: 1)
}
let app = AXUIElementCreateApplication(pid)
guard let button = walk(app, titles: req.titles.isEmpty
      ? ["Allow", "Continue", "Authorize", "Approve"]
      : req.titles) else {
  emit(Response(ok: false, error: "button-not-found"), code: 1)
}
guard clickCenter(button) else {
  emit(Response(ok: false, error: "click-failed"), code: 1)
}
emit(Response(ok: true, error: nil), code: 0)
```

**`login-ax.spec.ts` assertions (locked):** point at fake helper `packages/app/test/fakes/fake-axclick.sh` (not the real binary on CI). Fake prints JSON errors for the cases below. Assertions: button-not-found → error JSON `{ok:false,error:"button-not-found"}`; title matcher covers Allow|Continue|Authorize|Approve; deny-accessibility → `accessibility-denied`; does **not** call `cliclick`. Real binary + Accessibility + Chrome is **M2b local-only** and **M7** (re-grant after each ad-hoc rebuild).


#### 5.5.8 Hindsight extraResources recipe (authoritative)

**Build machine:** Apple Silicon only. Other plan lines that mention “extraResources recipe” **mean this section**.

**Layout** (under `resources/hindsight/` after the packaging run, or `$DEST` in dev):

```
resources/hindsight/
  python/            # relocated python-build-standalone 3.11 arm64;
                     # hindsight-all installed INTO this Python (not --target)
  hf-cache/          # HF_HOME with BAAI/bge-small-en-v1.5 + cross-encoder/ms-marco-MiniLM-L-6-v2
  bin/hindsight-api  # wrapper below (sets HF_HOME + offline flags + host/port, then execs
                     # "$ROOT/python/bin/hindsight-api")
```

**No** `site-packages/` via `pip install --target`. **No** “python -m or console script” fork — spawn always uses this wrapper.

**Script:** `scripts/dev/bundle-hindsight.sh` (create in M1). Env: `DEST` defaults to repo-root `resources/hindsight` (packaging); **dev M1** runs with `DEST=$HOME/.openbot/hindsight`.

**Pinned steps (exact order):**

1. Download/unpack **python-build-standalone** latest **3.11.x arm64** that day into `$DEST/python/`. Record URL + sha256 for the packaging pin (step 5).
2. Install into **that** Python (vendored pip — **not** `--target`, **not** a missing `PYTHONPATH`):
   ```
   "$DEST/python/bin/python3" -m pip install 'hindsight-all==0.9.0'
   ```
   Then `ls "$DEST/python/bin"`. If the 0.9.0 console script is **not** named `hindsight-api`, **stop and revise** (do not invent a module entry).
3. Write wrapper `$DEST/bin/hindsight-api` (exact body):
```sh
   #!/bin/sh
   ROOT="$(cd "$(dirname "$0")/.." && pwd)"
   export HF_HOME="$ROOT/hf-cache"
   export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
   export HINDSIGHT_API_HOST=127.0.0.1
   export HINDSIGHT_API_PORT="${OPENBOT_HINDSIGHT_PORT:-8888}"
   exec "$ROOT/python/bin/hindsight-api" "$@"
   ```
   `chmod +x "$DEST/bin/hindsight-api"`.
4. `HF_HOME=$DEST/hf-cache` with that Python: instantiate `SentenceTransformer('BAAI/bge-small-en-v1.5')` and `CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')` so weights land in `hf-cache/`.
5. Smoke: `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1` start `$DEST/bin/hindsight-api` bound to **127.0.0.1**; assert it answers HTTP on the smoke port; then stop it. **Do not** seed or copy `pg0` into the bundle.
6. **Pin file (packaging DEST only):** write `packages/daemon/src/memory/hindsight-pin.json` **only** when `DEST` is the repo `resources/hindsight` tree. Dev `DEST=$HOME/.openbot/hindsight` must **not** overwrite the committed pin. Authoritative `treeSha256` = packaging tree. Fields:
   - `python`: the 3.11.x version string
   - `hindsightAll`: `"0.9.0"`
   - `models`: `["BAAI/bge-small-en-v1.5","cross-encoder/ms-marco-MiniLM-L-6-v2"]`
   - `pythonStandaloneUrl` / `pythonStandaloneSha256`
   - `treeSha256`: sha256 of the **entire** packaging `$DEST` tree with **one** algorithm:  
     `find "$DEST" -type f | sort | xargs shasum -a 256 | shasum -a 256`  
     (**not** the CLI binary alone; **not** a single wheel file).

**First-use data (runtime, not the bundle):** `mkdir -p ~/.openbot/hindsight/data` empty; Hindsight creates `pg0` on first start. Bundle stays read-only python + weights + wrapper.

**Spawn path:** `join(resourcePath or ~/.openbot/hindsight, 'bin/hindsight-api')`. Wrapper owns `HF_HOME` / offline / host / port; daemon may still pass `--host`/`--port` if the smoke probe says so, plus LLM provider env from §3.5. Writable data root: `~/.openbot/hindsight/data`.

**Packager:** electron-builder `extraResources` copies `../../resources/hindsight` → `hindsight` (§8 M2b). electron-vite does **not** own this tree.

#### 5.5.1 Memory retain + MEMORY.md snapshot (exact recipe)

File: `packages/daemon/src/memory/memory-snapshot-recipe.md` (operator notes for implementers; the daemon code follows this recipe — **no** Haiku / Codex one-shot writer).

```
After a user/peer turn-finished:
1. POST /v1/default/banks/<memoryBankId>/memories { items: [{ content: turnText(finishedTurn) }] }
   (on 404: PUT /v1/default/banks/<memoryBankId> {} then retry retain once — or skip PUT if M1 probe shows auto-create)
2. POST .../memories/recall { query: "durable facts worth recalling later", max_tokens: 4000 }
3. Rewrite MEMORY.md as bullets from results[].text (cap ~16000 chars).
4. Do not write memory/YYYY-MM-DD.md from this step.
On any failure or 120s timeout: log [memory] agent=<id> failed; leave MEMORY.md untouched.
TurnSource stays 'memory-writer' (hidden; cost still counts).
```

`turnText(turn)` (used here and for compact-on-switch): join that turn’s `text` parts with `\n`; each `tool` part as `[tool] {name} {inputSummary}` on its own line; each `peer-message` part as its `text`; **skip** `reasoning` and `compaction` parts. At turn **start**, still load preamble + `role.md` + `MEMORY.md`, and also `recall(query=user text, max_tokens=1024)` into `memoryAppend`. **Deliberate:** snapshot recall is 4000 tokens; turn-start recall is 1024 (snapshot fuller; turn-start short). The Claude haiku one-shot writer is **gone**.

#### 5.5.2 Compact-on-switch prompt (exact)

File: `packages/daemon/src/harness/compact-prompt.md`.

```
You summarize the prior thread so a different coding agent can continue the same work.
Write a short briefing: goal, decisions made, files touched, what is left.
No tools. No questions. Return only the briefing.
```

User message = that body + `\n\n---\n# Thread slice\n` + the slice from §3.5 (tail 32_000 chars). Claude compact: Agent SDK one-shot, model `claude-haiku-4-5`, tools none, no resume. Codex compact: argv in §3.5 (no resume). Inject: destination session user message = the briefing text.

#### 5.5.3 Harness icons script (exact)

`scripts/fetch-harness-icons.sh`:

1. mkdir `packages/app/src/assets/harness`
2. Claude — `curl -fsSL --compressed -o /tmp/openbot-claude.vsix` VSIX `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/anthropic/vsextensions/claude-code/2.1.228/vspackage`, then `unzip -o /tmp/openbot-claude.vsix -d /tmp/openbot-claude-vsix`, copy `extension/resources/claude-logo.svg` → `packages/app/src/assets/harness/claude-code.svg`, assert sha256 of the **first** `<path>` `d` attribute `7c9c195500ec3caed3a183d8f8758a2252955ee76af691b3fc5c20b3cd8caa58` (ignore extra paths). Do **not** pipe curl into unzip (unzip cannot read a stream).
3. Codex — `curl -fsSL https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/openai.svg` → `packages/app/src/assets/harness/codex.svg` (simple-icons `openai`, CC0-1.0). Assert path-d sha256 `3fae9b38d571a5ab5aa662bc279dcda580855d6ca6b35330e4b4ba171367ffb1` (verified 2026-08-13 against that URL; the old `8af0a604…` pin was wrong)
4. Recolor **after** the asserts: in both SVGs, set every `fill` and `stroke` that is not `none` to `currentColor`. If a `<path>` has **no** `fill` attribute (the Codex file), **add** `fill="currentColor"` on that `<path>`. Do not change `d`. The pin is on the pre-recolor `d`. If fetch fails the sha256 test fails — no decorative stand-in; **stop and revise**. Run this script **once** in M2 and **commit** the four generated files (`claude-code.svg`, `codex.svg`, `menubarTemplate.png`, `menubar-unreadTemplate.png`). CI never runs this script. Switcher CSS: `color: var(--ink)` on the idle chip, `color: var(--accent-ink)` on the selected chip (selected chip fill remains `--accent`). M2 test: both SVGs contain `currentColor` and do **not** contain `#D97757` or a `#000000` fill.
5. Menu bar icons (same script, same “no stand-in”): write `scripts/render-menubar-icons.swift` with the exact body below, then `swift scripts/render-menubar-icons.swift packages/app/src/assets`. If `swift` exits non-zero, the script fails. The `Template` suffix on the filename is what makes them template images — do not set an `isTemplate` PNG property.

```
import AppKit
import Foundation

func render(unread: Bool, url: URL) {
  let size = NSSize(width: 22, height: 22)
  let config = NSImage.SymbolConfiguration(pointSize: 13, weight: .regular)
  guard let symbol = NSImage(systemSymbolName: "person.2", accessibilityDescription: nil)?
    .withSymbolConfiguration(config) else { FileHandle.standardError.write(Data("missing person.2\n".utf8)); exit(1) }
  let canvas = NSImage(size: size)
  canvas.lockFocus()
  NSColor.clear.setFill()
  NSRect(origin: .zero, size: size).fill()
  let s = symbol.size
  let origin = NSPoint(
    x: ((22 - s.width) / 2).rounded(.down),
    y: ((22 - s.height) / 2).rounded(.down)
  )
  symbol.draw(in: NSRect(origin: origin, size: s), from: .zero, operation: .sourceOver, fraction: 1)
  if unread {
    NSColor.black.setFill()
    NSBezierPath(ovalIn: NSRect(x: 16, y: 2, width: 6, height: 6)).fill()
  }
  canvas.unlockFocus()
  guard let tiff = canvas.tiffRepresentation,
        let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
  try! png.write(to: url)
}

if CommandLine.arguments.count < 2 { exit(1) }
let outDir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
render(unread: false, url: outDir.appendingPathComponent("menubarTemplate.png"))
render(unread: true, url: outDir.appendingPathComponent("menubar-unreadTemplate.png"))
```

#### 5.5.4 Daemon files (M1)

Package `@openbot/daemon`. Start: `pnpm --filter @openbot/daemon start` → `tsx src/main.ts` (listens `127.0.0.1:8799`). No `dist/`. Scripts: `"start": "tsx src/main.ts"`, `"typecheck": "tsc --noEmit"`. DevDep `tsx`. The **repo root** `package.json` also lists `tsx` as a devDependency (same version) so `repoRoot/node_modules/.bin/tsx` exists under pnpm. Tests: `pnpm --filter @openbot/daemon test`. `vitest.config.ts` coverage.provider v8, `thresholds.lines=80`, include `src/**/*.ts`. Smoke: `node packages/daemon/scripts/smoke.mjs` (create + send + stop against a real `claude`).

```
packages/daemon/
  package.json
  tsconfig.json
  vitest.config.ts
  scripts/smoke.mjs
  scripts/ask-probe.mjs
  src/
    main.ts
    wire/
      framing.ts
      ws-server.ts
    team/
      store.ts                   (agent.setFast rewrite team.json; no setPlan)
      create-delete.ts           (agent.create / agent.delete / agent.rename)
      skills.ts                  (agent.skills — M1)
      files.ts                   (M6 — do not create in M1)
    turns/
      run.ts
      queue.ts
      reducer.ts
    claude/
      adapter.ts
      write-deny.ts
      models.json
    codex/
      adapter.ts                 (M1b)
    mcp/
      http.ts
      peer-tools.ts
    mcp-browser/
      tools.ts                   (M5 — do not create this file in M1)
    memory/
      hindsight-client.ts
      hindsight-spawn.ts
      snapshot.ts                (retain + rewrite MEMORY.md)
      memory-snapshot-recipe.md
      preamble.md
      preamble-browser.md        (M5 — do not create in M1)
    peer/
      deliver.ts
    harness/
      switch.ts                  (M1b)
      compact-prompt.md
  test/
    turns.test.ts
    write-deny.test.ts
    peer.test.ts
    ask.test.ts
    ws.test.ts
    mcp.test.ts
    login.test.ts
    team.test.ts               (+ rename / setFast / create-by-description / memoryBankId)
    skills.test.ts             (agent.skills first-wins / skip / empty)
    memory.test.ts             (Hindsight fake client)
    hindsight-spawn.test.ts
    models.test.ts             (agent.models catalogs)
    codex.test.ts              (M1b)
    harness-switch.test.ts     (M1b — empty/compact + paused→continue)
    resume.test.ts             (Resume continues stopped work; empty queue)
    terminal.test.ts           (M5 — terminal_read / shell_run / terminal.run + no-focus-steal)
    shell-mcp.test.ts          (M5 — preferred path + fallbacks: no toolAliases keeps Bash; failed Codex probe omits shell_tool=false; command_execution still maps)
    browser-gate.test.ts       (M5)
    files.test.ts              (M6)
```

`repoRoot` in the daemon = `join(fileURLToPath(import.meta.url), '../../../..')` resolved, i.e. the folder that contains `pnpm-workspace.yaml` (`src/main.ts` → `packages/daemon` → `packages` → repo root). `main.ts` reads `OPENBOT_ADMIN_TOKEN`. Data root `OPENBOT_HOME` = `process.env.OPENBOT_HOME ?? join(homedir(), '.openbot')` — every `~/.openbot` path in this plan is under that root. Bind host **`127.0.0.1` only**; port = `Number(process.env.OPENBOT_PORT ?? 8799)` (tests may use `0`, then read `server.address().port`). Serves WS and `/mcp/:agentId`. Tests set `OPENBOT_HOME` to a temp dir so they never touch the developer’s real home or a live daemon. `packages/daemon/src/claude/adapter.ts` exports `runTurn({ queryFn, ... })` where `queryFn` defaults to the SDK `query`; tests pass a fake that records whether the call resumed and which `tools` array was used. `packages/daemon/src/codex/adapter.ts` exports `runTurn({ spawnFn })` defaulting to `child_process.spawn`; tests pass a fake spawn. `packages/daemon/package.json` `"exports": { ".": "./src/main.ts", "./wire": "./src/wire/framing.ts", "./turns": "./src/turns/reducer.ts" }`. `packages/daemon/package.json` dependency `"@openbot/protocol": "workspace:*"`. `packages/app/package.json` dependencies `"@openbot/daemon": "workspace:*"` and `"@openbot/protocol": "workspace:*"`. Fake-daemon and the app import `{ encodeFrame, decodeFrame } from "@openbot/daemon/wire"`. One Node `http.createServer` owns the listen. WebSocket: package `ws` (`WebSocketServer({ server })`). MCP Streamable HTTP: `@modelcontextprotocol/sdk` **1.x** (`StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`) on the same server’s `/mcp/:agentId` path. Pin `ws` from `npm view`. Pin the SDK with `npm view @modelcontextprotocol/sdk@1 version`. Do not add Express. Main Claude turns pass `options.model = AgentConfig.model` (default `claude-sonnet-5`). Also register Hindsight MCP HTTP URL alongside openbot. Pin `@anthropic-ai/claude-agent-sdk` in `package.json` at M1 to **`>=0.3.231`** (`McpHttpServerConfig.timeout` exists from that version). `npm view` that day; if the latest is below 0.3.231, **stop and revise**. Record the number. Memory snapshot uses Hindsight (no Haiku writer).

#### 5.5.5 App files (M2)

Package `@openbot/app`. Bundler: **electron-vite** `^5` (v5 is what provides `build.externalizeDeps`; do not pin v4). `electron.vite.config.ts` (docs: electron-vite.org/guide/dependency-handling, fetched 2026-08-13):

```
import { defineConfig } from 'electron-vite'
export default defineConfig({
  main: { build: { externalizeDeps: { exclude: ['@openbot/daemon', '@openbot/protocol'] } } },
  preload: { build: { externalizeDeps: { exclude: ['@openbot/daemon', '@openbot/protocol'] } } },
  renderer: {}
})
```

Those two workspace packages are TypeScript-source-only (no `dist/`); they **must** be bundled. Do not leave them external. `electron` dependency **`>=36.5.0`** (`before-mouse-event`). Also add dependencies `react` and `react-dom` (pin both from `npm view react version` that day) and devDependency `@playwright/test` (pin from `npm view @playwright/test version`). `packages/app/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022","DOM","DOM.Iterable"], "types": ["electron-vite/node"], "noEmit": true, "declaration": false }, "include": ["src/**/*","e2e/**/*"] }`. Renderer entry (keep electron-vite’s default input `src/renderer/index.html`): `index.html` is `<!doctype html><html><body><div id="root"></div><script type="module" src="./main.tsx"></script></body></html>`. `main.tsx`: `import { createRoot } from 'react-dom/client'; import { App } from './App'; createRoot(document.getElementById('root')!).render(<App />)`. Dev: `pnpm --filter @openbot/app dev` (main process: `app.requestSingleInstanceLock()`; `repoRoot` in Electron main = `join(app.getAppPath(), '../..')` (dev: `app.getAppPath()` is `packages/app`). Spawn daemon child: `spawn(join(repoRoot, 'node_modules/.bin/tsx'), [join(repoRoot, 'packages/daemon/src/main.ts')], { env: { ...process.env, OPENBOT_ADMIN_TOKEN }, stdio: ['ignore','pipe','pipe'] })`; if the child exits `EADDRINUSE`, the §3.5 Port in use dialog. `app.on('before-quit')` as in §3.5 Quit kills the daemon). Playwright: add `"test:e2e": "playwright test"` in `packages/app/package.json`. Launch: `electron.launch({ args: ['.'] })` (`import { _electron as electron } from '@playwright/test'`) after `electron-vite build`; main entry `packages/app/out/main/index.js`. When `OPENBOT_DAEMON_WS` is set, skip spawn (§3.5 E2E seam). `playwright.config.ts` `webServer.command` is `../../node_modules/.bin/tsx e2e/fake-daemon.ts` (cwd `packages/app`; do **not** use `npx tsx`) (`webServer.url` `http://127.0.0.1:18799/health`). Env: `OPENBOT_ADMIN_TOKEN=test-token`. Each spec appends `&scenario=app|ask|peer|browser|files` to `OPENBOT_DAEMON_WS` (e.g. `ws://127.0.0.1:18799/?token=test-token&scenario=app`). The fake daemon reads `scenario` **per connection**. Do **not** use a process-wide `OPENBOT_E2E_SCENARIO`. Fake-daemon: bind `127.0.0.1:18799` (not 8799 — that is the real daemon), `GET /health` 200, framing per §3.5 Transport, token `test-token`. On connect the app sends `event.stream`; the fake replies `{ok:true}` and then may push. **Fake-daemon contract (must implement per connection):**

**`app` scenario:**
- `agent.list` empty → `agent.create` ok
- `agent.models` → `[{ id:'claude-sonnet-5', displayName:'Sonnet 5', efforts:['low','medium','high','xhigh','max'] }]`
- `agent.setModel` → `{ ok:true, agent }`
- `agent.get` / `agent-runtime` include `contextUsed`, `contextWindow`, `sessionId`, `mcp`
- `chat.send` while fixture `harnessAuth[activeHarness]==='logged-out'` → `{ ok:false, error:'needs-login' }` and push `needs-login` banner
- `harness.startLogin` → `{ ok:true }`
- `chat.history` can return a turn with `source:'harness-switch-compact'` (label **Context compacted**)
- `agent.compact` → push `kind:'turn-created'` for a `source:'compact'` divider turn (compaction part with `id`; not a mystery divider frame)
- `agent.skills` → `[{ name:'draft', body:'Draft it.' }]`
- then: push `agent-runtime` `state:'thinking'` (team row **working**); `chat.send` → push `reasoning-text` `Working.`

**`ask`:** after send, push one `ask-user-question` (two options); `ask.answer` ok.

**`peer`:** list Ada+Bea; history has sent/received `peer-message`.

**`browser`:** after create push `needs-site` `example.com`; after allow-site, a `browser.exec` navigate `https://example.com`; Take-over uses `browser.setHumanControl`; second Browser tab is **app-local** (fake need not create views). `terminal.read`: if that agent has no Terminal tabs → `no-terminal`; after a tab exists (focus or write) → return `'prompt% '`.

**`files`:** one in-memory agent; `agent.files` returns `['role.md','MEMORY.md']`; `agent.readFile` `MEMORY.md` returns `'hello'`.

```
packages/app/
  package.json
  tsconfig.json
  electron.vite.config.ts
  src/
    main/
      index.ts
      menu.ts                    (M2 — Menu.setApplicationMenu)
      tray.ts                    (M2 — Tray + unread.set)
      tray-notify.ts             (M2 — Notification wrapper)
      tray-notify.test.ts        (M2 — unit; denied/unsupported path; vitest)
      arch.ts                    (M2 — isAppleSilicon)
      arch.test.ts               (M2 — Vitest)
      browser-view.ts            (M5)
      terminal-pty.ts            (M5 — node-pty; pty data handler stamps lastWrittenAt; focus stamps lastFocusedAt)
    preload/
      index.ts
    renderer/
      index.html
      main.tsx
      App.tsx
      team/
        TeamList.tsx
        NewAgent.tsx
      thread/
        PartTimeline.tsx
        Composer.tsx
      thread-ask/
        AskCard.tsx
      browser/
        Chrome.tsx               (M5 only — **do not create this file in M2a**; tree entry is a future path)
      terminal/
        TerminalTab.tsx          (M5)
      files/
        FilesPane.tsx            (M6 — right-pane tab)
      right-pane/
        TabStrip.tsx             (M2 shell; Browser/Terminal/Files)
        PlusMenu.tsx
      ui/
        tokens.css
        HarnessSwitcher.tsx
        ModelPicker.tsx          (M2)
        ContextDonut.tsx         (M2)
        SlashMenu.tsx            (M2)
    assets/harness/
    assets/menubarTemplate.png
    assets/menubar-unreadTemplate.png
  e2e/
    fake-daemon.ts
    app.spec.ts
    login-ax.spec.ts           (M2 — fake-axclick unit assertions; real binary M2b/M7)
    ask.spec.ts                (M3)
    peer.spec.ts               (M4)
    browser.spec.ts            (M5)
    files.spec.ts              (M6)
  test/fakes/
    fake-axclick.sh            (M2 — login-ax unit assertions; no Accessibility)
  helpers/
    openbot-axclick             (M2 swiftc build before login-ax; M2b afterPack)
  build/
    entitlements.mac.plist     (M2b — §8 body)
  scripts/
    after-pack.cjs             (M2b — §8 body)
  electron-builder.yml         (M2b — §8 body; appId com.openbot.app)
  src/native/
    openbot-axclick.swift       (§5.5.7)
  vitest.config.ts             (M2 — tray-notify + arch)
  playwright.config.ts         (projects: ci + local-ax; §9 uses ci)
```

#### 5.5.6 Agent preamble and MCP tool copy (exact)

File `packages/daemon/src/memory/preamble.md` (M1 — prepended on every turn, ahead of `role.md`):

```
You are part of a lasting team on this Mac (OpenBot). Other agents are teammates, not tools: call list_agents, then message_agent with the full request. There is no shared room; the human watches another agent by opening them.

When you message a teammate, keep talking to the human in your own thread: say what you asked them to do, keep your own work moving, and report back when they finish or when you hear from them. Do not go silent after delegating.

Teammate tools: Claude sees them as mcp__openbot__list_agents and mcp__openbot__message_agent — call those names. Codex sees list_agents and message_agent.

You may work elsewhere on this Mac. Do not write another agent's folder (~/.openbot/agents/<their-slug>/). You may read it. Do not read or write ~/.openbot/private/, ~/.openbot/team.json, ~/.openbot/login-url, or credential dirs.

Prefer the OpenBot shell tool so commands appear in visible Terminal tabs (Claude: mcp__openbot__shell_run when aliased; Codex: shell_run). Nested Agent tools may use a private shell. If the visible-shell path is unavailable, built-in shell still works.
```

After that body the daemon appends **one** ask line, chosen by `AgentConfig.harness`:

- `claude-code`: `Ask the human with AskUserQuestion whenever a choice, preference, or missing fact would change the work. Prefer a card over guessing. Use it a lot.`
- `codex`: `Ask the human with request_user_input whenever a choice, preference, or missing fact would change the work. Prefer a card over guessing. Use it a lot. Do not ask only in prose.`

File `packages/daemon/src/memory/preamble-browser.md` (M5 — concatenate immediately after `preamble.md`, still ahead of `role.md`; do not create this file in M1):

```
You have an in-app browser the human can also see. Tools: browser_navigate, browser_snapshot, browser_click, browser_type, browser_screenshot. Shell commands you run appear in visible Terminal tabs (you may open more than one). Creating or writing to a Terminal tab must not steal the human's focus; they can click your tool row to open that tab. You may read Terminal output with terminal_read (including what the human typed). Write-deny rules still apply to shell commands. New sites wait for the human to allow them.
```

Pin `@modelcontextprotocol/sdk` **1.x** (`npm view @modelcontextprotocol/sdk@1 version` that day — must start with `1.`). Imports:

```
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
```

If either path 404s at that 1.x, **stop and revise**. Register with the **v1** method `server.tool(name, description, rawShape, handler)` — **not** `registerTool` and **not** `z.object(...)`. Handlers return `{ content: [{ type: 'text', text }] }` except `browser_screenshot` which returns `{ content: [{ type: 'image', data, mimeType: 'image/png' }] }` as in §5.2.

**M1** (`packages/daemon/src/mcp/peer-tools.ts`):

```
server.tool(
  'list_agents',
  'List the other people on this team. Returns each agent\'s id, name, and slug. Call this before message_agent if you do not know the id.',
  {},
  async () => ({ content: [{ type: 'text', text: JSON.stringify(others) }] })
)

server.tool(
  'message_agent',
  'Send work to another agent on this team. They receive the full text and start or continue their own thread. Use list_agents to get toAgentId. Do not message yourself.',
  { toAgentId: z.string(), text: z.string() },
  async ({ toAgentId, text }) => ({ content: [{ type: 'text', text: JSON.stringify(result) }] })
)
```

`others` is `{ id, name, slug }[]` excluding the caller. `result` is `{ ok:true }` or `{ ok:false, error }` as in §5.4.

**M5** (`packages/daemon/src/mcp-browser/tools.ts`) — same `server.tool` shape (raw Zod shape, not `z.object`):

| name | description | inputSchema |
|---|---|---|
| `browser_navigate` | Open a URL in this agent's in-app browser (the pane the human can also see). A new site waits for the human to allow it. | `{ url: z.string() }` |
| `browser_snapshot` | List clickable and fillable elements on the current page, each with a ref (e1, e2, …). Refs die after navigate or a new snapshot. | `{}` |
| `browser_click` | Click an element from the last snapshot. Pass its ref. | `{ ref: z.string() }` |
| `browser_type` | Type into an element from the last snapshot. Pass its ref and the text. | `{ ref: z.string(), text: z.string() }` |
| `browser_screenshot` | Take a PNG of the current page. Use when layout or images matter more than the element list. | `{}` |
| `terminal_read` | Read the last output from this agent's Terminal tabs (most recently written, else last-focused; only errors when there are no tabs). | `{}` |
| `shell_run` | Run a shell command in a visible Terminal tab for this agent. Never steals focus. Write-deny still applies. | `{ command: z.string(), cwd?: z.string(), timeoutMs?: z.number(), tabId?: z.string() }` |

`mcp.test.ts` asserts the two M1 `description` strings match the literals above. `browser-gate.test.ts` asserts the five browser M5 `description` strings match. `terminal.test.ts` covers `terminal_read`. `shell-mcp.test.ts` asserts the `shell_run` description string and preferred-path wiring (alias / `shell_tool=false`); **and** these **fallback** cases: (1) SDK types **without** `toolAliases` → Claude options have **no** alias key and **Bash is not** in `disallowedTools`; (2) failed Codex probe → `config.toml` **omits** `shell_tool = false` and `command_execution` still maps to tool rows. When the preferred path is unavailable, document built-in fallback and still pass.

---

## 6. App layout (v1)

```
┌─ Team ──────┬─ Agent A (thread) ──────────────┬─ Right pane ──────────┐
│ New agent   │  [banner]                       │ [Browser][Term][Files]│
│             │─────────────────────────────────│ [+]  (several each)   │
│ (empty or   │  thread: you ↔ A                │───────────────────────│
│  names)     │    reasoning row                │ Frontmost tab body:   │
│             │    tool: Read                   │  Browser: url + page  │
│ Ada working │    ── Messaged B ──             │  Terminal: you type   │
│ Bea idle    │    Ask / request_user_input card│  Files: list+preview  │
│             │─────────────────────────────────│  (closed until open)  │
│             │  [Claude] [Codex]  ← switcher   │                       │
│             │  composer / input bar:          │                       │
│             │    model◎donut  spend  [Send|Stop|Resume]│             │
│             │    / slash · Message {name}     │                       │
└─────────────┴─────────────────────────────────┴───────────────────────┘
```

Empty team: team column + **New agent**. No fake contacts. Right column when no agent is selected: the same helper “Add someone, then give them work.” (no thread, no composer).

**New agent** (Cmd+N or the button) opens a **modal** (not a sheet, not an inline row). Title **New agent**. Fields: **Name** (optional if description set, placeholder `Ada`) → `agent.create.name`; **What they do** (optional if name set, placeholder `Research the repo and open a PR`) → `description`. Submit **Add** enabled when either field has non-whitespace text. If only description is filled, show the **derived name** in the Name field (editable) before submit. Errors: `need-name-or-description` → “Add a name or a short description.”; `invalid-name` → “That name isn’t usable. Try letters or numbers.”; `slug-taken` → “Someone already has that name.” Loading: disable Add and show **Creating…**. On network/daemon error: keep the modal open with **Couldn’t create agent. Try again.** On success: close the modal, select the new agent, focus the composer; if harness is logged-out, show `needs-login` immediately.

**Team row status** (the word after the name; map `AgentState`):

| State | Label |
|---|---|
| `idle` | idle |
| `thinking` | working |
| `needs-you` | needs you |
| `memorizing` | working |
| `compacting` | working |
| `paused` | paused |
| `error` | error |

Queued user bubbles: muted **Queued** under the text while that send is still in the daemon queue; gone when the next assistant turn starts. Dropped queue items show **Not sent — too much queued text.** instead.

**Attention dot** on the row: shown when state is `needs-you` **or** that agent has any open actionable banner (`needs-login`, `needs-site`, `memory-error`). **Unread:** a second dot when, while that agent is not selected, either a `peer-message` `direction:'received'` arrives **or** new visible assistant output is appended (`assistant-text` / completed turn). Cleared when you open that thread. Renderer calls preload IPC `unread.set { count }` whenever the attention-agent set size changes (§3.5 Tray — includes blocked work). Menu items stay Open / Pause all / Resume all / Quit.

**… menu (M2):** hover the team-list row → **…** → **Rename** then **Delete** (that order). **Rename:** small modal, placeholder = current name; sends `agent.rename` (slug frozen — folder / `CODEX_HOME` / bank_id unchanged). Empty/whitespace → `invalid-name`. Confirm delete copy in §5.2.

**Application menu (M2):** `packages/app/src/main/menu.ts`, built at app ready with `Menu.setApplicationMenu`. Exact tree (macOS):
- **App** menu: `role: 'appMenu'` (About / Hide / Quit — do not omit)
- **File**: one item `{ label: 'New agent', accelerator: 'Cmd+N', click: () => … open New agent modal }`
- **Edit**: `{ role: 'editMenu' }` — **required** so Cmd+C / Cmd+V / Cmd+A work in the composer and URL bar
- **View**: `{ label: 'Browser', accelerator: 'Cmd+Shift+B', click: () => … open/focus Browser tab on the selected agent }`
- **Window**: `{ role: 'windowMenu' }`

Playwright clicks **File → New agent** and **View → Browser** via `Menu.getApplicationMenu()` (same as already specified).

**Shortcut owning layer (locked — tests must match):**
- **Menu accelerators** (Playwright clicks the application menu, not `page.keyboard`): **Cmd+N** New agent; **Cmd+Shift+B** Browser (do not replace with ⌘T).
- **Renderer key handlers** (Playwright `page.keyboard` is OK): **Ctrl+`** toggle Terminal; **Cmd+P** Files search; **Ctrl+L** clear Terminal **only while a Terminal tab is focused**.

**Banners:** at the **top of the thread** (there is no harness/spend toolbar above the thread), scoped to the **selected** agent. Stack newest on top. Taking an action (allow-site, deny-site, log-in, resume, dismiss) clears that banner. Two banners at once both show.

**Sidebar (locked):** keep **name + status word + attention/unread dots**. Rename is the **… → Rename** modal above (slug frozen).

**Model picker (M2):** inside the composer (`data-testid="composer"`), next to the context donut on the **input bar**. Shows **only models for the selected harness**, loaded via `agent.models` (renderer does not read disk). Hide `codex-auto-review` / non-list visibility. Claude = model + effort levels `low|medium|high|xhigh|max` (via picker or `/effort` → `agent.setModel`). Codex = **model + effort** from catalog. Sticky until `agent.setModel`. Disabled while thinking like the harness switcher. Does **not** appear in a top agent header, window title bar, or toolbar above the thread.

**Context donut (M2):** Codex-style circular bar **next to the model name** on the same input bar (`data-testid="composer"`), always on (not a settings toggle). Plain language: the **context window** is how much of this conversation still fits for the model. The ring shows used vs remaining from the **last finished** turn (`AgentRuntime.contextUsed` / `contextWindow`, filled from `turn-finished.usage`). Hover shows numbers. Mid-turn: keep showing last finished (or empty ring + tooltip **Waiting for usage** if none). Do **not** invent mid-delta token counts. Does **not** appear in a top agent header, window title bar, or toolbar above the thread.

**Spend chip (M2):** on the same input bar (`data-testid="composer"`), next to model◎donut and `composer-primary` (Send / Stop / Resume). Shows `spendUsdToday` (calendar day, local TZ). Does **not** appear in a top agent header or toolbar above the thread.

**Slash commands (M2):** `/` in the composer opens that harness’s command menu. OpenBot **intercepts** — not sent as chat. Documented name lists: `saved-results/chatgpt-codex-desktop-commands-2026-08-14.md`. **What OpenBot does** (one row each):

| Command | What OpenBot does |
|---|---|
| `/model` | Open the model picker (UI-only; no harness call) |
| `/effort` (Claude) `/reasoning` (Codex) | Open effort control → `agent.setModel` |
| `/compact` | Sends `agent.compact` (daemon). Visible divider **Context compacted** / `reason:'manual'` |
| `/status` `/usage` `/context` | App overlay from selected agent’s runtime: spend, donut (`contextUsed`/`contextWindow`), `sessionId`. No extra daemon message |
| `/mcp` | App overlay lists `runtime.mcp` (name, url, last). **No tokens** in the renderer |
| `/init` | `chat.send` with this **exact** text — Claude: `Write a CLAUDE.md in this workspace that describes who you are and how you work here. Use the files already in this folder.` — Codex: `Write an AGENTS.md in this workspace that describes who you are and how you work here. Use the files already in this folder.` |
| `/fast` | Sends `agent.setFast { fast: !current }` (toggle). Writes `AgentConfig.fast`. Claude/Codex availability rules in §5.2 |
| `/clear` | Sends `agent.clear` (daemon). Divider **New conversation** / `reason:'clear'` (no `forHarness`); then null sessions. Keep `thread.jsonl` (history stays above the divider — matches Claude/Codex keep-history clear). Memory bank unchanged |

**Unknown slash:** if the user submits a `/command` that is not intercepted and not a skill name, do **not** send it as chat. Show a one-line composer error **Unknown command. Try /model or /compact.** (or list the closest built-in). Escape clears the error.

**Plan mode:** **out entirely**. No `/plan`, no `agent.setPlan`, no `AgentConfig.plan`, no “Ask to plan,” no Claude `permissionMode: 'plan'`, no Codex collaboration_modes. Do not replace with a fake.

**Skills (M0 schema, M1 daemon, M2 UI):** M1 implements `agent.skills` in `packages/daemon/src/team/skills.ts`. M2 slash menu calls it when `/` is typed (renderer does not read disk; order/skip set in §5.2). Picking a skill `chat.send`s `body + '\n' + userArgs` (`userArgs` = text after the command, may be empty). Real-window M2 verify does **not** require live skills/rename against the real daemon (M1 unit-tested); M2 Playwright stays on the fake.

Skip (unchanged): Codex `/cloud` `/cloud-environment` `/pet` `/review` `/ide-context` `/project` `/task` unless we have the analog; Claude `/vim` `/terminal-setup` `/login` `/logout` `/desktop` `/radio` `/stickers` `/upgrade` `/teleport` `/remote-control`. Login stays the **Log in** banner.

**Right-pane Files tabs (M6):** Files are **right-pane tabs**, not a left-bottom list. Multiple Files tabs allowed. Rows, in order: `role.md`, `MEMORY.md`, then `workspace/` files as a recursive flat list of relative paths, sorted with `localeCompare`, skipping directory names `node_modules` and `.git` and skipping `browser-history.jsonl`. Do **not** require daily-notes rows. `~/.openbot/private/` is not in this tree. **Cmd+P** opens/search files. Click a row → **read-only** preview (monospace `--mono`). No in-app save. v1 does not edit files here. Keep `agent.files` / `agent.readFile`.

### Accessibility contract (before UI implementation)

Shared rules for every icon-only control, modal, ask card, streaming row, and native browser view:

1. **Names:** every icon-only control has a changing accessible name + tooltip matching its action (`Send message`, `Stop agent`, `Resume agent`, `Return control`, close tab, etc.).
2. **Focus:** modals and menus set initial focus, trap focus while open, Escape closes, focus returns to the opener. Ask cards: single-select = radio group; multi-select = checkbox group; selected state exposed.
3. **Live regions:** carefully limited polite announcements for new `needs-you`, actionable banners, and turn complete/error — not for every streamed token.
4. **Targets / contrast:** focus rings and non-text boundaries meet WCAG 2.2 contrast; hit targets ≥ 24×24 CSS px.
5. **Motion / zoom:** honor reduced motion; 200% zoom/reflow keeps composer and tab strip usable; native `WebContentsView` bounds still track the pane slot.
6. **Tests:** Playwright asserts accessible names on `composer-primary` across Send/Stop/Resume; ask-card roles; Escape on New agent modal; notification permission-denied path does not trap focus.

### Loading / error / retry (pinned)

- Team list / history: show **Loading…** then content; on failure **Couldn’t load. Retry**; Retry re-calls `agent.list` / `chat.history`.
- Model catalog: on `agent.models` failure show **Couldn’t load models. Retry** in the picker.
- Create / rename / delete: keep modal open on failure with actionable error (see New agent / delete copy).
- First window close: one-time tip **Agents keep working. Use the menu bar icon to open OpenBot again.**
- Quit: warn when work is in flight **or** open ask cards (existing card modal; add in-flight copy when thinking/memorizing without a card).

### Look (do not invent a second design)

Visual spec: `saved-results/botbox-ui-concept-2026-08-13.html` **tokens and type only**. Layout is the ASCII in this section (team | thread+composer | right tab strip), **not** the concept’s 200px / 1fr / 420px live-screen column (that was the old noVNC pane), and **not** browser under the thread.

`:root` from that file (copy exactly):

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

Body stage background `#1a1a1a`. Selected harness / live dot uses `--accent`. Do not invent a second palette. No heavy UI kit; map these variables in `packages/app/src/renderer/ui/tokens.css`. Bundle the fonts locally: add `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` to `packages/app` dependencies and `@import` them at the top of `tokens.css`. Do **not** load Google Fonts in the desktop app.

Address bar suggestions: the **main process** reads `browser-history.jsonl` (this agent only). Preload IPC `history.suggest { agentId, q }` → `{ urls: string[] }` (last 20 matching substrings, newest first). The **renderer never** `fs.readFile`s that file. No match → Google search URL `https://www.google.com/search?q=`.

---

## 7. Runtime

| Piece | Choice | Why |
|---|---|---|
| App | Electron, macOS Apple Silicon first (M2b ad-hoc signed for login E2E; Developer-ID later) | Matches ChatGPT/Codex/Grok Bot/OpenMausBot Chromium shell |
| Claude Code | `@anthropic-ai/claude-agent-sdk` + `canUseTool` | Official AskUserQuestion |
| Codex | Official Codex CLI JSONL + `request_user_input` | Same `AskCard.tsx` |
| Memory | Bundled Python 3.11 + `hindsight-all==0.9.0` + baked weights (Apple Silicon) | Offline first use; live retain/recall; `MEMORY.md` snapshot |
| Loop | `packages/daemon` on localhost | Survives window close; dies on Quit |
| Data | `~/.openbot` | Same idea as `~/.openmausbot`, `~/.claude`, `~/.cursor` |

Launch at login: optional later. v1: menu bar + keep working while the app process is alive.

---

## 8. Build order

Tests **before** implementation for each slice. After each slice that has a screen, **drive the real app** (not mocks alone).

### M0 — Protocol for the local team

**Done when:** `pnpm --filter @openbot/protocol test` green; remote-only schemas gone; new parts/messages exist.

1. **npm package rename (before any `@openbot/protocol` filter):** set `packages/protocol/package.json` `"name"` → `@openbot/protocol`; root `package.json` `"name"` → `openbot`; rewrite `.github/workflows/ci.yml` so the coverage step is `pnpm --filter @openbot/protocol test --coverage` (add `--filter @openbot/daemon` only once that package exists — do not invent a daemon filter that fails today). **Delete** today’s step `pnpm --filter @botbox/bot-image test` and the comment that mentions `BOTBOX_IMAGE_TESTS`. Symbol rename `Bot*`/`botId` → `Agent*`/`agentId` stays a later step in this same PR (step 4).
2. Tests first in `packages/protocol/test/schemas.test.ts`: `peer-message` with `text` (reject `summary`); `ask-user-question` status `'open'|'answered'|'cancelled'` (reject a fourth); HarnessEvent `kind:'ask-user-question-status'`; `agent.create` accepts name-only, description-only, and both (reject empty both with `need-name-or-description`); `agent.files`; `agent.readFile`; `agent.delete`; `agent.list`; `agent.setModel` (`model` required, `effort` optional; errors include `'busy'|'invalid-model'|'agent-not-found'`; **`invalid-model`** when model id missing from `agent.models` catalog **or** effort not in that model’s `efforts`); `agent.models` → `{ ok:true, models: Array<{ id, displayName, efforts? }> }` or `agent-not-found`; `agent.compact` / `agent.clear` / `agent.setFast` / `agent.skills` / `agent.rename` / `terminal.read` / `terminal.run` (request/response + errors: compact/clear busy+`agent-not-found`, compact also `needs-login`, rename `invalid-name`, terminal.read `no-terminal`/`unknown-agent`, terminal.run `no-app`/`write-denied`/`timeout`/…); **reject** `agent.setPlan` / `AgentConfig.plan` if present; `AgentConfig` requires `model: string` and `memoryBankId: string`, accepts optional `effort?: string`, `fast?: boolean`; **reject** any `roleMd` key on `AgentConfig` (role lives in `role.md` on disk); `chat.send` (error enum includes `'text-empty'`); `chat.history` with optional `limit` and required response `lastEnvelopeId` (number); `chat.stop` with `agentId` and error `'agent-not-found'` (reject `'bot-not-found'`); `ask.answer`; `browser.exec` all five ops; `browser.exec` **response** errors include `cross-site` with `url`+`host` (reject `needs-site` on the app response) and `nav-failed` (`errorCode`+`errorDescription`) and `op-failed`; `browser.allowSite`; `browser.setHumanControl`; `AgentContext` has `sessionId` and no Docker paths; no `tailnetDns` / `exitNodeEnabled` / `bot.setExitNode` / interventions / routines; `harness.completeLogin` **kept** (M0 asserts present; M1 paste probe may delete + update assertion in same PR). HarnessEvent `kind:'peer-message'`, `kind:'ask-user-question'`, and `kind:'turn-created'` (requires `createdAt: string`). HarnessEvent `kind:'compacted'` requires `partId`, `reason` `'harness-switch'|'manual'|'clear'` (reject `'auto'`), `forHarness` optional. `turn-finished` requires `outcome` (`complete`/`interrupted`/`error`) and accepts optional `errorMessage` (reject missing `outcome`); **`usage` is required** with **required nullable** `costUsd: number | null` (accept `{ costUsd: null }`; reject missing `usage` or missing `costUsd` key) plus optional `inputTokens` / `outputTokens` / `contextWindow` (**always** reject unknown usage keys via `.strict()`). Compaction / compacted `reason` is `'harness-switch'|'manual'|'clear'` (accept `'manual'` and `'clear'`; reject `'auto'`); compaction + `compacted` `forHarness` **optional** (omit ok on `clear`); `compacted` requires `partId`. `TurnSource` accepts `'clear'` and `'resume-continue'`. `EventStreamMetaSchema` accepts `{ type:'event.stream.meta', replayReset: true }`; `StreamEnvelopeSchema` **rejects** a `channel:'meta'` object. StreamEnvelope `agentId` (not `botId`). DaemonEvent `kind:'agent-runtime'`. Banners: keep `needs-login`/`disk-warn`; **add** `needs-site`/`memory-error`; **reject** `peer-rate-limit`; actions `allow-site`, `deny-site`, `resume`, `retry-memory`. `agent.get` response fields `agent` (not `config`) and `banners` (array, may be empty). `agent.list` items are `{ agent, runtime, banners }`, `banners` required, schema `.strict()`. `AgentRuntime.talkingToAgentId` is **added** as `string | null` (not on today’s BotRuntime); `contextUsed` / `contextWindow` are `number | null`; `sessionId` is `string | null`; `mcp` is `Array<{ name: 'openbot'|'hindsight', url: string, last: 'ok'|'fail'|null }>`. `AgentStateSchema` includes `needs-you` and has no `waiting-intervention`. `agent.setHarness` error enum is `'busy'|'compact-failed'|'inject-failed'|'needs-login'|'agent-not-found'` (reject `'harness-switch-busy'` and `'bot-not-found'`).  
3. Confirm they **fail**.  
4. Implement the strip+rename+new messages in §5.  
5. Confirm they **pass**.  
6. Coverage: after rename, CI runs `pnpm --filter @openbot/protocol test --coverage` (daemon filter only once that package exists); the `@botbox/bot-image` step was already deleted in step 1.

### M1 — Local loop, one agent, no UI polish

**Done when:** a scripted client can `agent.create`, `chat.send`, see streamed `reasoning-text` / `assistant-text`, `chat.stop`, `agent.pause` / `agent.resume`; Hindsight retain+snapshot runs after a user/peer turn.

- `packages/daemon` as §5.5.4. Spawns Claude Agent SDK with `options.cwd` = that agent’s `workspace/` (`~/.openbot/agents/<slug>/workspace`) and `options.model` = `AgentConfig.model`.  
- Login banner still uses `e2e/computer-use/harness-login.md` if `needs-login`.  
- **Hindsight (dev path):** run §5.5.8 `scripts/dev/bundle-hindsight.sh` with `DEST=$HOME/.openbot/hindsight` (first-use offline; Apple Silicon only). Full electron-builder packaging + **ad-hoc** signing is **M2b**. `setup-hindsight.sh` may wrap that script — not the only path. Spawn via `spawnHindsight` → `bin/hindsight-api` as in §3.5 / §5.5.8; memory load (preamble + role.md + MEMORY.md + recall) and retain+snapshot as in §3.5 / §5.5.1. Missing binary / port busy → visible `memory-error` (never quiet no-op). PreToolUse write-deny as in §3.5. Create `packages/daemon/src/claude/models.json` from https://code.claude.com/docs/en/model-config that day. Implement `agent.models`.  
- MCP HTTP server on `127.0.0.1:8799/mcp/<agentId>` with `list_agents` / `message_agent` (even with one agent). Claude MCP config includes openbot **and** Hindsight URLs.
- Daemon implements `agent.list`, `agent.get` (including `banners`), `agent.models`, `chat.history` (default last 50 visible turns, `limit` clamp 1–200, hidden-turn rule in §5.2), plus **`agent.rename`** (`create-delete.ts`), **`agent.setFast`** (`store.ts` — no setPlan), and **`agent.skills`** (`skills.ts`). M2 is UI + fake-daemon only for those.  
- Tests (write first, confirm fail, then implement):
  - `packages/daemon/test/memory.test.ts` — fake HTTP client: after user `turn-finished`, `POST .../memories` with `items[{content:turnText}]`; on first-retain 404, `PUT .../banks/{memoryBankId}` then retry once; `MEMORY.md` rewritten from `results[].text` bullets (≤16000 chars); on fake failure log `[memory] agent=<id> failed` and leave file untouched; turn start includes recall into `memoryAppend`; recall failure omits recall block, logs `[memory] recall-failed agent=<id>`, and surfaces `memory-error`; `agent.delete` calls `DELETE .../banks/{memoryBankId}` **before** removing team.json/dirs; **HTTP 404 → proceed** with file/row delete; **non-404 refuse / memory down → abort** (agent remains) + visible error; delete Ada then create Ada (same slug) → recall does not return old facts; no Haiku writer spawn.
  - `packages/daemon/test/hindsight-spawn.test.ts` — missing binary does not throw but pushes `memory-error` (logs `[memory] hindsight-missing`); port-busy retries `port+1` once and recorded Codex `config.toml` uses the **fallback** port not 8888; fake spawn records argv/env; after `login-finished` Claude from a no-creds start, spawn env has `HINDSIGHT_API_LLM_PROVIDER=claude-code`; first use creates empty `~/.openbot/hindsight/data` and copies **nothing** from a fake resource dir (assert fake bundle files are **not** in the data root).
  - `packages/daemon/test/models.test.ts` — Claude catalog includes `efforts: ['low','medium','high','xhigh','max']`; Codex catalog hides non-list / `codex-auto-review`; missing Codex cache returns luna fallback and logs `[models] catalog-missing harness=codex`.
  - `packages/daemon/test/turns.test.ts` — two-row send (user row then assistant row) plus `turn-created` for both; `chat.send` replies with the minted assistant `turnId` before any harness message; a fake spawn failure within 60s yields `turn-finished` `outcome:'error'` and state `error`; `chat.history` default last 50 visible, `limit` clamp 1–200, response includes `lastEnvelopeId`; resume uses stored `sessionId`; memory step is Hindsight (does not resume the main session; `source:'memory-writer'` hidden); `chat.send` while `needs-you` inserts a user row immediately and enqueues (harness join uses `[user]` prefixes that are **not** in `thread.jsonl`); `chat.send` while `harnessAuth[activeHarness]==='logged-out'` returns `needs-login`; deltas plus the complete `assistant` message for the same block leave a single `text` part equal to the streamed text; a fake stream of message #1 `[thinking idx0, text idx1, tool_use idx2]`, a `tool_result`, then message #2 `[text idx0]` yields four parts in order — reasoning, text, tool, and a **separate** second text part (`m0c0`, `m0c1`, tool id, `m1c0`); after an assistant part is concatenated, `thread.jsonl` still has **one** line for that `turnId` (rewrite, not a second append); `agent.pause` mid-turn → after memorizing, state is `paused`, queue held, `stopped-turn.json` written; spend file dated yesterday rolls over on `turn-finished`; main turn passes `options.model`; with `AgentConfig.effort` set, `options.effort` was passed to `query()`; `turn-finished.usage` can carry token/window fields and updates `contextUsed`/`contextWindow` on runtime; dropped queued user `turn-finished` has `usage: { costUsd: null }`; visible divider `turn-created` includes `createdAt`.
  - `packages/daemon/test/write-deny.test.ts` — Bash `echo x >> ~/.openbot/agents/bea/MEMORY.md` is denied; deny return object matches §3.5; `NotebookEdit` `{ notebook_path: '<abs bea MEMORY.md>' }` denied; fake tool `Patch` `{ path: '<abs bea file>' }` denied; `Read` of `~/.openbot/team.json` is denied; `Read` of `~/.openbot/private/bea/browser-allow.json` is denied; `Read` of Bea’s `MEMORY.md` is allowed.
  - `packages/daemon/test/peer.test.ts` — `message_agent` to a missing id returns `not-found` and appends **no** `peer-message` part on A; **no** `rate-limited` path (7+ peer turns in an hour still succeed); a peer message while B is `thinking` appends `direction:'received'` on B’s in-flight row immediately; delivery order is persist → memorizing (retain+snapshot) completes → then queued peer turn.
  - `packages/daemon/test/ws.test.ts` — bad token → close; `after` older than the ring → `replayReset`.
  - `packages/daemon/test/mcp.test.ts` — `list_agents`; `message_agent` missing id → `not-found`; Ada’s MCP token on Bea’s path → 401 (no `handleRequest`); admin token on `/mcp/` → 401; daemon start does **not** create `mcp-tokens.json`; two sequential `initialize` POSTs for the same agent in one daemon process both return HTTP 200.
  - `packages/daemon/test/login.test.ts` — parse Claude/Codex fixtures; 60s → `no-url`; 15 min / child exit → `timeout`; a pre-existing `login-url` is deleted before spawn and ignored if its mtime is before spawn.
  - `packages/daemon/test/team.test.ts` — `agent.create` appends `team.json` with `memoryBankId`; description-only create derives a name/slug; `agent.delete` DELETEs bank first (non-404 failure leaves agent present; 404 still deletes), then removes the row and dirs; daemon start writes `{agents:[]}` if missing; `agent.list` / `agent.get` return `{ agent, runtime, banners }` (`banners` required, may be empty); `agent.rename` changes name + `role.md` identity while slug + folders + `memoryBankId` unchanged; `agent.setFast` persists `fast` in `team.json` (no setPlan); returns `busy` while thinking.
  - `packages/daemon/test/resume.test.ts` — pause mid-turn writes `stopped-turn.json`; `agent.resume` with empty queue starts `source:'resume-continue'` in the same session without user text; with queued text, Resume drains the queue instead; after successful resume-continue, `stopped-turn.json` is gone.
  - `packages/daemon/test/skills.test.ts` — first-wins order per §5.2; skip built-in names; missing dirs → `{ ok:true, skills: [] }`.
  - `packages/daemon/test/ask.test.ts` — `canUseTool` for `AskUserQuestion` waits; emits `ask-user-question` and persists `status:'open'`; `ask.answer` returns `{questions, answers, response}` to the SDK and pushes `ask-user-question-status`; Stop/pause → `cancelled` + turn `interrupted`; after a fake crash, only `open` cards re-show; `ask.answer` with no live callback marks `answered` and starts a user turn whose text is `"{question}: {label}"` lines; `not-open` only when status is already `answered`/`cancelled`; composer `chat.send` while open enqueues.
  Coverage: those test files (plus later M1b/M5/M6 files as they land) must keep `pnpm --filter @openbot/daemon test --coverage` at the existing 80% line floor on `src/**/*.ts`.
- Verify: `node packages/daemon/scripts/smoke.mjs` against real `claude` on this Mac, then `node packages/daemon/scripts/ask-probe.mjs` (§5.3). `smoke.mjs` **must** see at least one `reasoning-text` event. If none: add `thinking: { type: 'adaptive' }` to main-turn `query()` options (`ThinkingConfig` in SDK 0.3.231 `sdk.d.ts`; keep it on every later main turn) and re-run smoke. Still none → **stop and revise**.

### M1b — Codex adapter + ask cards + model

**Done when:** `agent.setHarness` to `codex` on an idle agent streams Codex JSONL into the same `reasoning-text` / `tool-use` / `assistant-text` events; `compact-failed` keeps the old harness; Codex is on openbot + Hindsight MCP; `request_user_input` maps to `ask-user-question` parts; `agent.setModel` sticks; Codex can work elsewhere on the Mac while writes to other agents’ folders and OpenBot private paths are denied.

- Exact binary: `codex` on PATH (same pin policy as old plan: record version in daemon package.json).  
- Spend chip uses Codex usage if present, else “—”.  
- Isolation: cwd = that agent’s `workspace/`; full `config.toml` from §3.5 including `[features] default_mode_request_user_input = true` and `[mcp_servers.hindsight]`; `CODEX_HOME` = `~/.openbot/private/<slug>/codex-home`. **Permission-profile probe first** (§3.5) **with `--strict-config`**: pass = profile loaded (`codex doctor`/features) **and** write Desktop/home OK **and** write into another agent’s folder denied (read allowed) **and** private denied including read; keys that were ignored without `--strict-config` must fail now. Fail → **stop and revise** (do **not** fall back to `writable_roots=["homeDir"]` or own-folder-only).  
- Default Codex model `gpt-5.6-luna`; argv `--model` plus `--strict-config` plus `-c model_reasoning_effort=<effort>` when `AgentConfig.effort` is set (§3.5). If the CLI rejects that `-c` key, **stop and revise**. Do not pass `--effort`, `--plan`, or `--sandbox`. No Plan mode / collaboration_modes.
- **Probes before the adapter (order locked):** (1) JSON+MCP: one real `codex exec --json --skip-git-repo-check …` with `[mcp_servers.openbot]` present; confirm `thread.started` and `item.completed`; save `turn.completed` (and any usage-bearing item) to `packages/daemon/test/fixtures/codex/turn-completed.jsonl`. If `--json` is silent, **stop and revise**. (2) Ask: prompt a two-option `request_user_input`; save the raw item to `packages/daemon/test/fixtures/codex/request-user-input.jsonl` and answer bytes to `request-user-input-answer.jsonl`; pass = tool fires **and** turn continues after stdin. If never fires, no question text, or stdin rejected, **stop and revise**. (3) Write-scope probe above. Then write the adapter and pin field names from those fixtures in §3.5.
- Tests (write first, fixtures required after probes): `packages/daemon/test/codex.test.ts` — if `request-user-input.jsonl` missing, throw `run the probe`; generated `config.toml` has hindsight MCP url using daemon `hindsightPort` and `memoryBankId`, `default_permissions = "openbot"`, `shell_tool = false`, and permission filesystem rules (not `writable_roots=["homeDir"]`, not own-folder-only); spawn `stdio` pipe; maps fixture → `ask-user-question`; stdin write on `ask.answer`; usage maps **exact** keys from `turn-completed.jsonl` (or empty donut / “—” until usage exists); when effort is set, built argv contains `-c` `model_reasoning_effort=<effort>` and does **not** contain `--effort`; after a fake turn writes a different `auth.json` in the agent home, shared `~/.openbot/codex-home/auth.json` matches it. `packages/daemon/test/harness-switch.test.ts`: empty slice / compact / `reason:'harness-switch'`; live divider via `turn-created` + `compacted` with `partId`; `agent.compact` → `source:'compact'` / `reason:'manual'`; `agent.clear` → `source:'clear'` / `reason:'clear'` label **New conversation** (no `forHarness`; `compacted` may be omitted); switch while `paused` with `stopped-turn.json` **only rewrites** harness/session to destination and continues (**null destination session → create + persist then continue**); paused with **no** `stopped-turn.json` → idle and no turn; `compact-failed` rolls back to old harness + prior paused state.
- Verify: one real Codex turn, then `codex exec resume <thread_id>`. If resume fails, **stop and revise**.

### M2a — Thin browser chrome contract (before M5) — **contract-only, no `Chrome.tsx` code**

**Done when:** the plan contract is locked; no OSS browser-shell package is selected or forked; **no** `Chrome.tsx` implementation lands in this milestone.

1. Document the thin themed chrome contract: URL bar, back/forward/reload, You’re driving / Return control over Electron `WebContentsView`; theme to ChatGPT desktop / Codex tokens (§6). Preload IPC names pinned in §5.2 (`browser.navigate` / `back` / `forward` / `reload` / `setBounds`).
2. Do **not** pin/fork `electron-browser-shell`, Reframe, or `electron-as-browser`.
3. Do **not** create `packages/app/src/renderer/browser/Chrome.tsx` in M2a — **no file until M5** (no empty stub).
4. Until M5: Browser tab in the `+` menu stays **disabled** with tooltip **Coming in a later build** (same as Terminal/Files in M2).
5. **M5** implements `Chrome.tsx` + views + tests + real-surface verification.

### M2 — Mac app: team + thread + picker + donut + slash + right-pane shell

**Done when:** a stranger opens the app, sees an **empty team**, hits **New agent**, talks, sees reasoning + tool rows; model picker + context donut + `/` slash menu work; right-pane tab strip shell exists (may stay closed until M5/M6 fill bodies).

- Electron app as §5.5.5 (`electron` `>=36.5.0`). Look: §6 tokens. Layout: §6 ASCII (team | thread+composer | right tab strip). Sidebar: name + status word + attention/unread dots.  
- Harness switcher **above** the composer / input bar (real logos from `scripts/fetch-harness-icons.sh`). Codex button enabled (M1b already landed); disabled while a turn is in flight with tooltip “Wait until this turn finishes.”  
- **Inside** `[data-testid=composer]` (bottom input bar): model picker + context donut + spend chip + one primary button `data-testid="composer-primary"` (Send / Stop / Resume — §2.2), then `/` slash and the message field. No separate Stop or Pause controls. Claude = model + effort; Codex = model + effort; defaults `claude-sonnet-5` / `gpt-5.6-luna`; hide `codex-auto-review`; picker sends `agent.setModel`; disabled while thinking. Donut always on; hover numbers; empty ring + “Waiting for usage” when no usage yet. Spend shows `spendUsdToday`. These controls do **not** live in a top-of-column toolbar / agent header. Enter while Stop queues; Resume continues stopped work (§2.2 / §3.5). No `/plan`.  
- **Slash menu:** `/` intercepted; Codex and Claude lists from §6 (unknown command error pinned).  
- Empty-state copy as in §3.5. First-run login strip when harnesses are logged-out (no failed first message). Tray from `packages/app/src/main/tray.ts` (Open / Pause all / Resume all / Quit; `unread.set` includes blocked work). macOS notifications when unfocused (§3.5). Pause all protects open ask cards. Closing the window does not quit the process; first close shows continue tip. Banner row at the **top of the thread** (§6): a pushed `needs-login` renders with **Log in**; that action sends `harness.startLogin`. On `login-challenge`, app main runs the full Mac Chrome runbook including code entry + Allow (§3.5). Hindsight first-use progress / `memory-error` banner. Accessibility contract (§6).  
- Tests (write first): `packages/app/e2e/app.spec.ts` — window shows heading **Team**, button **New agent**, helper “Add someone, then give them work.”; after create, a **fixture** harness stream (one `reasoning-text` event) shows that row; an agent in state `thinking` shows label **working**; team row shows **name + status word** (not “talking to …”); a fixture `harness-switch-compact` turn renders the divider label **Context compacted**; a pushed `needs-login` banner renders and its **Log in** action sends `harness.startLogin`; `chat.send` while the fixture agent is `logged-out` leaves the typed text in the composer and shows the `needs-login` banner; **File → New agent** via `Menu.getApplicationMenu()` (do **not** send Cmd+N via `page.keyboard`); **View → Browser** via the same menu API is present but the Browser tab body stays disabled until M5 (Coming-later); model picker, context donut, spend chip, and `composer-primary` are inside `[data-testid=composer]` and Playwright asserts they are **not** in a top-of-column toolbar and that there is **no** separate Pause control in the composer; fixture `thinking` → primary is **stop** and click sends `agent.pause`; Enter while thinking with non-empty text queues (`chat.send` enqueue) and primary stays stop; Enter while memorizing/compacting enqueues Queued while primary stays disabled-stop; fixture `paused` → primary is **resume**, click sends `agent.resume` (draft text stays; does not send; empty queue → resume-continue turn); Enter while paused does **not** `chat.send` and shows **Resume to send**; idle + non-empty text → **send** icon and `chat.send`; empty field → send disabled; description-only New agent succeeds; model picker is fed by `agent.models` and sends `agent.setModel`; `/model` opens the picker; `/compact` sends `agent.compact` and (fixture) shows **Context compacted**; choosing fake skill `/draft` `chat.send`s `Draft it.` (body from `agent.skills`); `/` + unknown command does **not** send as chat and shows **Unknown command…**; no `/plan` entry; context donut renders from runtime context fields (or Waiting for usage); right-pane `+` menu lists Terminal / Browser / Files (no Review) with **Browser, Terminal, and Files disabled** (tooltip **Coming in a later build**); after a fixture `peer-message` `direction:'received'` **or** assistant output while that agent is not selected, attention set updates; `needs-you` counts toward tray attention; `electronApp.evaluate` calling `unread.set({ count: 1 })` makes `getTrayUnread()` true (if Tray cannot be asserted without a display, this IPC unit still runs; real-window verify checks the icon by eye); **… → Rename** → type a new name → row shows the new name and `agent.get` still has the same `slug` (fake-daemon; real rename/skills against the real daemon are M1 unit-tested). Command: `pnpm --filter @openbot/app test:e2e` (`playwright test` via `playwright.config.ts`; `electron.launch({ args: ['.'] })` (`import { _electron as electron } from '@playwright/test'`) after `electron-vite build`; main entry `packages/app/out/main/index.js`). Add `"main": "out/main/index.js"`, `"dev": "electron-vite dev"`, `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"build": "electron-vite build"`, and `"typecheck": "tsc --noEmit"` in `packages/app/package.json`. Add `packages/app/vitest.config.ts` covering `tray-notify.test.ts` and `arch.test.ts`. First launch on Intel: `!isAppleSilicon()` → copy **OpenBot needs Apple Silicon.** and do not start daemon. Login AX: see numbered helper + fixture steps below. CI: Ubuntu runs `pnpm --filter @openbot/app test`; `app-e2e` job in §9 (`macos-14`) runs Playwright **`--project=ci`** (does **not** run `login-ax.spec.ts`). That app.spec’s `OPENBOT_DAEMON_WS` includes `&scenario=app` (§5.5.5). Application menu from `packages/app/src/main/menu.ts` (§6).
- **M2 helper + login-ax (numbered):**
  1. Write `packages/app/src/native/openbot-axclick.swift` (§5.5.7 body).
  2. Write fake `packages/app/test/fakes/fake-axclick.sh` that prints the locked JSON errors (`button-not-found`, `accessibility-denied`, etc.) and exits non-zero on those cases.
  3. Run §5.5.7 `swiftc -O -o packages/app/helpers/openbot-axclick packages/app/src/native/openbot-axclick.swift` **before** writing/running `login-ax.spec.ts` (so the real binary exists for local `local-ax`; CI still uses the fake via the test).
  4. Write `packages/app/playwright.config.ts` with two projects: `ci` (`testIgnore: ['**/login-ax.spec.ts']`) and `local-ax` (`testMatch: ['**/login-ax.spec.ts']`). §9 `app-e2e` uses **`--project=ci`**.
  5. Write `packages/app/e2e/login-ax.spec.ts` unit assertions against the **fake** helper (no Accessibility on CI). Real binary + Accessibility + Chrome = M2b / M7 only.
- Verify: that Playwright file **and** a recorded drive of the real window (picker, donut, slash table behaviors, tab strip `+` menu with Terminal/Files disabled, tray unread by eye). Does **not** require live skills/rename against the real daemon.

### M2b — Packaging (coding-agent milestone, before stranger test)

**Done when:** Apple Silicon **ad-hoc / locally signed** packaged app (`appId` **`com.openbot.app`**) bundles Python 3.11 + `hindsight-all==0.9.0` + baked weights via electron-builder `extraResources`; ad-hoc signed Allow-click E2E passes **after re-granting** Accessibility + Screen Recording on that rebuild; Intel first-launch gate blocks with **OpenBot needs Apple Silicon.**; packaged size recorded (no size cap). **Not** App Sandbox / **not** Mac App Store. **Developer-ID + notarize** = follow-on after M2b (document in out-of-scope / follow-ons; **not** an M2b blocker). **Do not** try a stable ad-hoc identity — after **each** ad-hoc rebuild, re-grant Accessibility and Screen Recording (document in verify below and in M7).

**Roles (locked):** **electron-vite** = dev/build compiler (`pnpm --filter @openbot/app build`). **electron-builder** = packager (`electron-builder` dependency pin **latest 26.x that day** in `packages/app/package.json` — verified 2026-08-14 npm latest `26.15.7`). Do **not** write “electron-builder / electron-vite extraResources” as an or.

1. Run §5.5.8 `scripts/dev/bundle-hindsight.sh` with packaging `DEST=resources/hindsight` so `hindsight-pin.json` `treeSha256` matches that tree (dev DEST must not overwrite the pin).
2. Ensure §5.5.7 helper exists at `packages/app/helpers/openbot-axclick` (`swiftc` as in M2).
3. Add packager files (paste bodies below — paths are under `packages/app/`; yaml paths are relative to that package).
4. Package with electron-builder (`mac.identity: null` for this milestone).
5. **Re-grant** Accessibility + Screen Recording for this new ad-hoc binary, then run Allow-click E2E.
6. Arch: reuse `packages/app/src/main/arch.ts` — Intel shows blocking copy and does not start daemon.
7. After first successful package: measure app size and write `saved-results/openbot-app-size-YYYY-MM-DD.md` (keep full Hindsight — **no size cap**).
8. Tests: **ad-hoc signed** app E2E for login Allow-click (real helper); deny-permission path still covered. CI does **not** run this (local-only).
9. Real-surface: launch the **ad-hoc signed** packaged app, complete one harness login Allow-click end-to-end **after** re-grant.

**`packages/app/electron-builder.yml` (complete body):**

```yaml
appId: com.openbot.app
productName: OpenBot
mac:
  target:
    - dmg
    - zip
  identity: null
  hardenedRuntime: true
  entitlements: build/entitlements.mac.plist
  extendInfo:
    NSAppleEventsUsageDescription: OpenBot needs to control Google Chrome to finish sign-in.
    NSScreenCaptureUsageDescription: OpenBot needs Screen Recording to finish sign-in in Chrome.
extraResources:
  - from: ../../resources/hindsight
    to: hindsight
afterPack: scripts/after-pack.cjs
```

**`packages/app/build/entitlements.mac.plist` (complete body — no App Sandbox):**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
  <key>com.apple.security.automation.apple-events</key>
  <true/>
</dict>
</plist>
```

**`packages/app/scripts/after-pack.cjs` (complete body):**

```js
const { copyFileSync, chmodSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const helpersDir = join(context.appOutDir, `${appName}.app`, 'Contents', 'Helpers')
  mkdirSync(helpersDir, { recursive: true })
  const src = join(context.packager.projectDir, 'helpers', 'openbot-axclick')
  if (!existsSync(src)) {
    throw new Error(`[after-pack] missing helper at ${src}; run §5.5.7 swiftc first`)
  }
  const dest = join(helpersDir, 'openbot-axclick')
  copyFileSync(src, dest)
  chmodSync(dest, 0o755)
}
```

**Dev mode** continues with §5.5.8 `DEST=$HOME/.openbot/hindsight` (does **not** write `hindsight-pin.json`). First-use still creates empty `~/.openbot/hindsight/data` (no `pg0` copy).

### M3 — AskUserQuestion cards

**Done when:** a turn that calls `AskUserQuestion` shows the card; clicking an option continues the turn; Other accepts free text.

- **App-side only** (daemon `ask.test.ts` already shipped in M1). One card component used by both harnesses (`AskCard.tsx`).
- Tests (write first): `packages/app/e2e/ask.spec.ts` (`&scenario=ask` on `OPENBOT_DAEMON_WS`) — fixture `ask-user-question` part renders the first question’s options; a one-question card: click an option sends `ask.answer` with `answers` keyed on question text; a two-question fixture stays `open` after the first click and sends `ask.answer` only after the second; a `multiSelect` question requires **Done**; Other sends `answers` with the typed text as that question’s value (not `response`, not the word `"Other"`); **Answer in chat instead** then a composer send sends `ask.answer` with `response` and empty `answers`.  
- Verify: that Playwright file **and** a real Claude Code turn that asks.

### M4 — Agent-to-agent markers

**Done when:** A can message B; A’s thread shows **Messaged B**; B’s thread shows the inbound work; opening B is how you watch B.

- App markers only (`peer.send` already ships in M1). Render `peer-message` `direction:'sent'` as centered **Messaged {peerName}**; `direction:'received'` as **Message from {peerName}**.
- Tests (write first): `packages/app/e2e/peer.spec.ts` (`&scenario=peer` on `OPENBOT_DAEMON_WS`) — two fixture agents Ada/Bea; a `peer-message` `direction:'sent'` part in Ada’s thread renders **Messaged Bea**; a `direction:'received'` part in Bea’s thread shows the inbound `text`; while Ada is selected, Bea’s team row shows the unread dot until Bea is selected.  
- Verify: that Playwright file **and** two agents in the real app.

### M5 — Right-pane Browser + Terminal tabs

**Done when:** Cmd+Shift+B opens a Browser tab in that agent’s right pane; multiple browser tabs work; agent drives the frontmost; click-to-drive + **You’re driving** / **Return control** only on the browser pane; Terminal tabs are visible for you and for agent shell commands; `terminal_read` returns buffer text; agent can open a URL via `browser_navigate`; tabs close and clean up.

- Multiple Chromium views per agent + profile path as in §3.5. Frontmost browser tab gets bounds; others off-window. **Implement thin `Chrome.tsx`** (M5 — not M2a) themed to Codex tokens over `WebContentsView`, using preload IPC `browser.navigate` / `back` / `forward` / `reload` / `setBounds`. New OS windows become new tabs. Take control as in §3.5 — **browser pane only**. Tab close / last-tab closes pane / overflow (§3.5). **Enable Browser and Terminal** in the `+` menu (Files stays disabled until M6). **Cmd+Shift+B** is a **menu accelerator** — Playwright clicks **View → Browser** via `electronApp.evaluate` on `Menu.getApplicationMenu()` (do **not** send Cmd+Shift+B via `page.keyboard`). Tests + real-surface verification for browser chrome land **here**.
- **Terminal packages (pin in M5):** add to `packages/app/package.json`: `node-pty` (npm view latest **1.x** that day) and `@xterm/xterm` + `@xterm/addon-fit` (latest **5.x** that day). Main process owns the pty (`packages/app/src/main/terminal-pty.ts`); renderer owns xterm. IPC: `terminal.create { agentId, tabId }`, `terminal.write { tabId, data }`, `terminal.data { tabId, data }` (pushes), **`terminal.focus { agentId, tabId }`** (stamps `lastFocusedAt`) when the user selects a Terminal tab **or** clicks a matching tool row (app-local). Preferred main-agent shell via MCP `shell_run` → daemon→app `terminal.run` (`stealFocus:false`); creating/running **must not** call `focus()` / steal focus. Trace shows a named tool row that opens/focuses that tab when clicked. Claude: prefer `toolAliases: { Bash: 'mcp__openbot__shell_run' }` when present in `sdk.d.ts`; else keep Bash. Codex: prefer `shell_tool = false` + MCP; else keep `command_execution`. **M5 probe:** assert preferred path when available; if missing, document built-in fallback and **still pass**. Nested Agent private shell allowed. Main keeps `Map<tabId, { agentId, ring: string, lastWrittenAt?, lastFocusedAt? }>` — last **8000** chars; **pty `data` handler stamps `lastWrittenAt`**. Shell = `process.env.SHELL ?? '/bin/zsh'`, cwd = that agent’s `workspace/`. Write-deny still applies (§3.5). Electron native rebuild: pin **`@electron/rebuild`** (not the old `electron-rebuild` package) latest **4.x** that day in `packages/app` (verified 2026-08-14 npm: `4.2.0` — same pin-latest-that-day rule as `node-pty`). `packages/app` `postinstall`: `electron-rebuild -f -w node-pty` via the `@electron/rebuild` CLI. **Do not** write “or electron-vite equivalent.” **Ctrl+`** and **Ctrl+L** (clear only while Terminal focused) are **renderer key handlers** — Playwright `page.keyboard` is OK.
- Register `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, `browser_snapshot`, **`terminal_read`**, and **`shell_run`** on the **existing** `/mcp/<agentId>` server — `shell_run` **only** in `packages/daemon/src/mcp-browser/tools.ts` (no second file). Browser payloads = §5.2 `browser.exec` (target frontmost browser tab). MCP `terminal_read` → latest `lastWrittenAt` then latest `lastFocusedAt`; `no-terminal` only when no tabs. MCP `shell_run` → `terminal.run` with output cap 32k; if MCP/app missing, built-in shell remains. If no app connected: 30s then MCP `no-app`. The `app-e2e` job needs outbound network for `https://example.com`.  
- Tests (write first): `packages/daemon/test/browser-gate.test.ts` — `browser_navigate` to a new host does **not** call `browser.exec` and pushes `needs-site`; a `cross-site` app response stores pending `{ op:'navigate', url }` (not a click replay). `packages/daemon/test/terminal.test.ts` — `terminal_read` with no tabs → `no-terminal`; prefers most recently written then last-focused; with a buffer → last ≤8000 chars; `shell_run` / `terminal.run` never steals focus; write-denied / timeout errors; MCP forwards correctly. `packages/app/e2e/browser.spec.ts` (`&scenario=browser` on `OPENBOT_DAEMON_WS`) — open Browser via **View → Browser** menu; `+` menu has Terminal **enabled** (Files still disabled); `+` can add a second Browser tab; close tab destroys view / kills pty; last tab closes pane; navigate to `https://example.com` → banner → **allow-site** → URL bar shows example.com; when the window is up and a `browser.exec` arrives with no Browser tab yet, a **visible Browser tab appears** then the op runs; mouseDown inside the page sets held and shows **You’re driving** / **Return control** (no thread marker); Return control clears held and unblocks tools; **page.keyboard** Ctrl+` opens Terminal with cwd under that agent’s workspace; Ctrl+L clears only while Terminal focused; after `terminal.focus`, `terminal.read` returns buffer text (fake: `'prompt% '`).
- Verify: agent navigates to `https://example.com` → `needs-site` banner → click **allow-site** → page loads; agent opens a second browser tab and it comes to the front; sign-in stays in-pane; click the page → You’re driving → Return control → agent continues from the current URL. Agent-driven tool click does **not** flip human control. Close the window, have the agent `browser_navigate` to an already-allowed host, confirm the window does **not** appear and the op succeeds (`stayHidden`). Agent runs a shell command → visible Terminal tab appears without stealing focus; click the tool row to focus it; type a command yourself; confirm `terminal_read` sees that output; close tabs and confirm cleanup.

### M6 — Files as right-pane tabs

**Done when:** a Files tab in the right pane lists `role.md`, `MEMORY.md`, and `workspace/` paths for the selected agent; Cmd+P opens/search files; click opens a read-only preview; `browser-profile/` is not listed; multiple Files tabs allowed; **Files** is enabled in the `+` menu. A can read B’s `MEMORY.md` from a tool; write to B’s folder is denied and visible.

- Daemon (this milestone): `packages/daemon/src/team/files.ts` implements `agent.files` / `agent.readFile`. Tests (write first): `packages/daemon/test/files.test.ts` — list matches §6 order (`role.md`, `MEMORY.md`, then workspace paths; no required daily-notes); `browser-profile/` and `node_modules` absent; `agent.readFile` of `../../bea/MEMORY.md` returns `forbidden`.
- Tests (write first): `packages/app/e2e/files.spec.ts` (`&scenario=files` on `OPENBOT_DAEMON_WS`) — Files tab in the **right pane** (not left-bottom); list includes `role.md` and `MEMORY.md`; does **not** include `browser-profile/`; click `MEMORY.md` opens a read-only preview (no save control); **page.keyboard** Cmd+P focuses file search (renderer handler); `+` menu has Files **enabled**; `+` can open a second Files tab.
- Verify: that Playwright file **and** a real-window drive against the **real** daemon (not only the fake).

`agent.delete` ships in M2 (confirm dialog + daemon delete order in §3.5 / §5.2) even though the files pane is M6. The `WebContentsView` close + `flushStorageData` steps are **no-ops until M5** (if no view exists, skip them).

**Last coding-agent product milestones:** M6 (Files) and **M2b** (packaging — may run after M2 / before or after M5–M6 as dependencies allow; must finish before stranger test). Stop here unless a human schedules M7.

### M7 — Stranger test (human-run, not coding-agent scope)

Someone who did **not** write this plan sits down with no pitch and records a pass in `saved-results/openbot-stranger-test-YYYY-MM-DD.md`. Name the observer in that file when the session is scheduled (do not invent a name in this plan). **Runs on the M2b ad-hoc signed local build** (not waiting on Developer-ID; `appId` **`com.openbot.app`**). **Before the session:** if this build was freshly packaged, **re-grant** Accessibility and Screen Recording (each ad-hoc rebuild is a new identity — do **not** try a stable ad-hoc identity). Script: (1) empty **Team** + **New agent**; (2) create Ada, give work; (3) create Bea; (4) Ada messages Bea; (5) markers in Ada, work in Bea; (6) a file exists in an agent folder. Fail if they only notice one agent.

---

## 9. Tests (standing)

Before each slice’s implementation code:

- Unit: protocol schemas, card mapping, peer-message rendering helpers  
- Integration: daemon + fake harness  
- E2E / Playwright: real window for M2+  
- Real-surface step in every milestone that has UI  

CI (`.github/workflows/ci.yml`): keep the existing `test` job on `ubuntu-latest` with `pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage` (v8 lines ≥80; do not put a `--` after `test`). **Remove** today’s `pnpm --filter @botbox/bot-image test` step (and its `BOTBOX_IMAGE_TESTS` comment) in M0; rewrite filters to `@openbot/*`. In M2: **add** step `pnpm --filter @openbot/app test` (Vitest: `tray-notify` + `arch`) to that **same** Ubuntu `test` job (**not** “or a sibling”). Add a **second** job `app-e2e` with `runs-on: macos-14` and steps: `pnpm install`, `pnpm --filter @openbot/app build`, `pnpm --filter @openbot/app test:e2e -- --project=ci`. The Playwright `ci` project **ignores** `login-ax.spec.ts` (no Accessibility / no real `openbot-axclick` on CI). Do **not** add Playwright to the Ubuntu job. M2b **ad-hoc signed** login E2E + `local-ax` project are local/machine only (re-grant Accessibility + Screen Recording after each ad-hoc rebuild).

---

## 10. Out of scope for this plan

Phone, Windows, Linux app, Intel Mac (v1 Apple Silicon only), Atlas-like standalone browser, Chrome extension, Composio, routines/cron, spend auto-cut, writing Chromium, pinning/forking an OSS browser-shell package (thin `Chrome.tsx` is in scope), remote desktop, group rooms, joining A↔B as a third speaker, **Review tab** (and Ctrl+Shift+G), **Plan mode / `/plan`**, peer-loop auto-pause, Hindsight Cloud / Hindsight’s own UI, extra API keys for memory, quiet memory-off, App Sandbox / Mac App Store distribution, `cliclick`, packaged-app **size cap** (measure only). M2 day-to-day still runs electron-vite from this repo (`pnpm --filter @openbot/app dev` or Playwright `electron.launch`). **M2b** = electron-builder package (`appId` **`com.openbot.app`**) + **ad-hoc / local signing** (`mac.identity: null`) + Allow-click E2E + size record; **re-grant** Accessibility + Screen Recording after each ad-hoc rebuild. **Follow-on (not M2b blocker):** Developer-ID signing + notarize for wider distribution. Packaging must finish before stranger test (**M7** runs on the ad-hoc build; same re-grant rule).

---

## 11. Verify-before-handoff (this document)

An implementer with zero prior context should: follow §2 for chrome, §3.5 for mechanisms, §5 for types, §8 for order. They should not choose transport, browser engine, take-over, peer tool, or New-agent flow.

Vision choices from `saved-results/boxbot-plan-vision-review-2026-08-14.md`, leftover calls from `saved-results/boxbot-leftover-calls-2026-08-14.md`, and capability-first fold homework from `saved-results/boxbot-capability-first-fold-judgment-2026-08-14.md` are **folded**: Resume continue; Codex permission profiles with absolute-path keys; thin `Chrome.tsx` in **M5** (M2a contract-only); Enter queues + paused Resume-to-send; no peer loop limit; **capability-first** visible shell (MCP preferred, built-in fallback — never fail-closed on Bash/`command_execution`); Hindsight Python+weights offline / Apple Silicon (`arch.ts`); packaging **M2b**; DELETE bank 404=proceed / non-404 abort; macOS notifications + tray-notify Vitest; click takeover pane-only; no Plan mode; paused harness switch **only rewrites** `stopped-turn.json`; strip `roleMd`; usage always `.strict()`; `Turn.costUsd` = last finished `usage.costUsd`. Live stop-and-revise pins in the body: Hindsight MCP path 404; Hindsight bank PUT 404 when create-on-404 needed; Codex permission keys rejected by CLI (no writable_roots homeDir fallback); Codex `request_user_input` fixture missing question text / never fires / stdin rejected; Codex `-c model_reasoning_effort=<effort>` rejected by CLI; Claude `options.effort` missing from pinned SDK; AskUserQuestion / Claude init tool missing; login credential probe inversion; Claude paste-code probe outcome; compact tools array non-empty; resume / `--json` silent. **Not** stop-and-revise: main-agent built-in shell when preferred MCP path is missing.

**Remaining user choices after this revision:** none (except GitHub repo rename later). `appId` is `com.openbot.app`. Developer-ID + notarize is a documented follow-on after M2b, not a blocker.
