# Coding-agent UI invariants (Claude Code, Codex, OpenCode)

**Date:** 2026-08-13  
**Purpose:** Facts for comparing a product plan to real coding-agent UIs — behaviors without which the agent loop fails or the user cannot supervise.  
**Scope:** Reference products only (Claude Code docs, Codex docs, OpenCode source/docs). Not Botbox plan content.  
**OpenCode tip commit used:** `37fe5c83dc13` (`dev` at fetch time). Note: user asked for `packages/ui/.../message-part.tsx`; on current `dev` the file lives at `packages/session-ui/src/components/message-part.tsx`.

**Gate metadata:** New research artifact only (no code importers/callers, no API or schema changes). User instruction: gather facts from OpenCode source and official Claude Code / Codex docs on what a coding-agent UI must get right; extract invariants; favor thoroughness and citations.

---

## Components Found

### Shared loop surfaces (all three)

| Surface | Claude Code | Codex | OpenCode |
|---|---|---|---|
| Composer / prompt | Interactive input; `@` file mention; image paste | TUI composer; `@` file; image drag/paste | Composer + docks |
| Permission / approval prompt | Mode-dependent pause; allow/ask/deny rules | Sandbox + approval policy; once/session scopes | `ask` → once / always / reject |
| Plan / read-only mode | Plan permission mode (`Shift+Tab`, `/plan`) | `/plan`, `read-only` via `/permissions` | Plan primary agent (edits/bash ask/deny) |
| Tool / transcript rendering | Ctrl+O transcript; tool lines | Formatted TUI output; reasoning effort config | `message-part.tsx` part types |
| File diffs | Editor/`git diff`; checkpoints | `/diff` (incl. untracked) | Edit permission shows diff; DiffChanges / session-diff |
| Stop / interrupt | Esc / Ctrl+C | `interrupt_turn` (default F12); Ctrl+C exits | `session_interrupt` = Escape |
| Follow-up while running | Type+Enter steers without stopping tool | Tab queues next turn; Enter injects into current | Follow-up dock; queue; Send now |
| Compaction | `/compact`, auto-compact | `/compact`, auto | Compaction agent + divider part; leader+c |
| Session list / resume | `/resume`, `--continue`, picker | `/resume`, `codex resume` | `session_list` leader+l |
| Todos | Ctrl+T task list | (not a first-class documented dock in fetched pages) | `todowrite` tool + SessionTodoDock |
| Cost / usage | `/usage`, `/cost` | `/usage`, `/status` token/context | Status view (leader+s) — cost not verified as primary |

### OpenCode UI (source)

- **Message parts:** `packages/session-ui/src/components/message-part.tsx` — part types include `tool`, `text`, `reasoning`, `compaction`, file attachments; tool registry for `read|list|glob|grep|bash|shell|edit|write|patch|apply_patch|todowrite|question|skill|task|webfetch|websearch`; tool statuses drive UI (`pending`/`running`/`completed`/`error`); aborted assistant text via `MessageAbortedError`.
- **Permission dock (app):** `packages/app/src/pages/session/composer/session-permission-dock.tsx` — Deny / Allow always / Allow once.
- **Permission TUI:** `packages/tui/src/routes/session/permission.tsx` (and older path under `packages/opencode/.../permission.tsx`) — edit shows inline diff; replies `once|always|reject`; reject can attach feedback.
- **Follow-up queue dock:** `session-followup-dock.tsx` — Send now / Edit.
- **Question dock / Todo dock / Revert dock:** composer siblings under `packages/app/src/pages/session/composer/`.
- **Queue runtime:** `packages/opencode/src/cli/cmd/run/runtime.queue.ts` — serial drain; AbortController per turn; queued prompts editable until start.
- **Keybinds:** `packages/tui/src/config/keybind.ts` — `session_interrupt: escape`, `session_compact: <leader>c`, `session_queued_prompts: <leader>q`, session list/fork/rename, child session navigation.
- **Compaction:** `packages/core/src/session/compaction.ts` — structured summary template; auto + manual; if busy, runs at next safe drain before queued prompts.

### Claude Code (docs)

- Permission modes + status bar: https://code.claude.com/docs/en/permission-modes  
- Permissions rules / prompts: https://code.claude.com/docs/en/permissions  
- Interactive shortcuts (Esc, Ctrl+C, @, image paste, Ctrl+T todos, Shift+Tab modes): https://code.claude.com/docs/en/interactive-mode  
- Agentic loop + steer (Esc cancel tool; type+Enter without stopping): https://code.claude.com/docs/en/how-claude-code-works  
- Sessions / resume / compact / branch: https://code.claude.com/docs/en/sessions  
- Cost `/usage`: https://code.claude.com/docs/en/costs  

### Codex (docs)

- Approvals + sandbox: https://developers.openai.com/codex/agent-approvals-security (also learn.chatgpt.com mirrors)  
- Sandbox concepts: https://developers.openai.com/codex/concepts/sandboxing  
- Auto-review: https://developers.openai.com/codex/concepts/sandboxing/auto-review  
- Slash commands / TUI shortcuts: https://developers.openai.com/codex/cli/slash-commands  
- Config keymap `interrupt_turn = "f12"`: https://developers.openai.com/codex/config-basic  
- Prompting / images / @: https://developers.openai.com/codex/prompting  

---

## Flow

### Send

1. User submits prompt (optionally `@` files, images, pasted content).  
2. Turn starts; model streams assistant parts + tool calls.  
3. UI must show streaming / running state (OpenCode: incomplete `time.completed`; Claude: live tool progress; Codex: TUI busy + Tab/Enter semantics).

### Tool call that needs approval

1. Harness evaluates permission mode / sandbox / rules.  
2. If ask: **loop blocks** until UI returns a decision.  
3. Claude: prompt with allow / don’t ask again (session or permanent depending on tool); modes change how often this happens; status bar shows mode.  
4. Codex: approval at sandbox boundary (or untrusted set); scopes once/session; or Auto-review / never.  
5. OpenCode: `permission.asked` → dock/TUI with once/always/reject; edit asks include diff metadata.

### File edit

1. Model proposes edit/write/patch.  
2. Either auto-allowed (acceptEdits / workspace-write / allow) or gated.  
3. UI should surface **what changed** (inline diff in OpenCode permission for edit; Codex `/diff`; Claude checkpoints + editor/git).  
4. Supervision fails if edits happen with no visible path/diff and no way to review.

### Stop

1. User interrupt must **cancel in-flight tool/turn** and return control.  
2. Claude: Esc cancels running tool; keeps work so far; Esc on permission dialog closes dialog instead. Ctrl+C interrupts or clears/exits.  
3. OpenCode: Escape → `session_interrupt`; aborted message marked interrupted.  
4. Codex: default F12 `interrupt_turn` (remappable); Ctrl+C closes session (`/exit`) — **interrupt ≠ exit**.

### Follow-up while running

1. Claude: type correction + Enter → steers after current action without stopping tool; Esc stops then redirect.  
2. Codex: **Tab** queues for next turn; **Enter** injects into current turn; slash commands can be Tab-queued.  
3. OpenCode: queue + FollowupDock Send now (abort current) / Edit; runtime AbortController on turn.

### Compact

1. Context near limit → auto summarize, or user `/compact` (Claude/Codex) / keybind (OpenCode).  
2. UI must show that history was replaced (OpenCode compaction divider part; Claude docs on what survives).  
3. OpenCode: if busy, compaction waits for drain barrier before promoting queued prompts.

### Reconnect / resume

1. Session persisted locally; resume restores transcript (+ some mode/model state).  
2. Claude: `--continue` / `--resume` / `/resume`; plan & bypassPermissions **not** restored; large cold resume may offer compact-first.  
3. Codex: `/resume`, `codex resume`.  
4. OpenCode: session list + fork keybinds; durable messages remain after compaction (docs).

---

## Boundaries

**UI must show / do (interactive local product):**

- Running vs idle vs waiting-for-you (permission / question).  
- A real interrupt that stops the turn (not just hide spinner).  
- Permission decision UI when policy is `ask` (or equivalent).  
- Enough of the tool call to decide (command string, file path, diff for edits).  
- Composer that can send while busy (queue or steer) without silent drop.  
- Session identity + resume entry point.  
- Compaction awareness (or users lose track of why the agent “forgot”).

**Can stay in CLI/daemon / non-UI:**

- OS sandbox enforcement (Codex/Claude sandbox).  
- Classifier / Auto-review / auto mode policy engines.  
- Transcript storage format, compaction summarizer model, MCP wiring.  
- Headless/`exec` / `-p` runs with pre-approved tools (no human prompt surface).  
- Theme, pets, vim keybindings, ambient status toys.

**When permission UI can be skipped:** only if the product’s trust model removes the ask path — e.g. Claude `bypassPermissions` in isolated containers, Codex `approval_policy=never` + danger-full-access, OpenCode `--auto` / allow rules, or cloud sandbox where host isn’t at risk. Skipping prompts without an equivalent boundary is loop-breaking for safety, not for completion.

---

## Non-Obvious Things

1. **Interrupt ≠ exit:** Codex Ctrl+C exits; turn interrupt is F12 by default. Claude Esc interrupts turn; Ctrl+C is interrupt-or-exit ladder.  
2. **Steer vs queue:** Claude Enter-while-busy steers mid-turn; Codex Tab=queue next, Enter=inject current — easy to confuse in a clone.  
3. **Permission prompt vs dialog Esc:** Claude Esc on a permission dialog closes the dialog, does not interrupt the agent.  
4. **Plan mode is a permission/agent mode, not a markdown flavor:** Claude plan blocks source edits until approve; OpenCode Plan agent denies/asks edits; Codex `/plan` unavailable while already working.  
5. **Sandbox can replace many prompts** (Codex Auto preset; Claude sandboxed bash auto-allow) — UI still needs escalation prompts at the boundary.  
6. **OpenCode `message-part` moved** to `packages/session-ui` (not `packages/ui`).  
7. **Compaction is part of the loop:** OpenCode inserts a visible compaction part; Claude auto-compacts and can thrash-error; without UI, users think the agent is broken.  
8. **Todos are agent-owned UI:** Claude Ctrl+T; OpenCode todowrite + dock — supervision of multi-step work, not decorative.  
9. **Always-approve is session-scoped in OpenCode** (“until OpenCode is restarted” in TUI always stage); Claude bash “don’t ask again” can be permanent per repo.  
10. **Protected paths** still prompt even in loose modes (Claude `.git`/`.claude`; Codex `.git`/`.codex` read-only in writable roots).

---

## Open Questions

- Exact Codex TUI widget for live approval cards (docs describe policy more than pixel layout) — need Codex OSS TUI source for line-level UI.  
- Whether OpenCode desktop “Send now” always maps to abort+promote (issue #12707 describes intent; confirm current `dev` wiring in app composer controller).  
- Claude IDE vs CLI parity for image paste / permission chrome (docs differ by surface).  
- Cost display as invariant: strongly present in Claude/Codex docs; OpenCode status exists but dollar cost UX not deeply verified here.  
- Reconnect mid-turn (WebSocket/daemon): OpenCode app sync exists; exact reconnect UX for in-flight tools not fully traced.

---

## Candidate invariants

| # | Invariant | Severity | Evidence |
|---|---|---|---|
| 1 | While a tool needs human approval, the turn **blocks** until the UI returns allow/deny (or a configured auto-approver). | **loop-breaking** | Claude permission modes; Codex approvals; OpenCode ask→once/always/reject |
| 2 | Interrupt control must **abort the in-flight turn/tool**, not only hide UI. | **loop-breaking** | Claude Esc; OpenCode Escape `session_interrupt`; Codex `interrupt_turn` |
| 3 | User must be able to distinguish **idle / running / waiting-on-you**. | **loop-breaking** (waiting) / **supervision** (running) | Permission docks; Claude status bar modes; Codex busy Tab/Enter |
| 4 | Approval UI must show **action identity** (command, path, or edit diff). | **loop-breaking** for safe local use | OpenCode edit+diff in permission.tsx; Claude Ctrl+E explainer; Codex asks beyond sandbox |
| 5 | File edits must be **reviewable** (inline or `/diff` / editor). | **supervision** (loop still runs) | Codex `/diff`; OpenCode DiffChanges; Claude checkpoints |
| 6 | Follow-ups during a run must **queue or steer**, not silently drop. | **loop-breaking** if drop; else **ergonomic** | Claude Enter steer; Codex Tab/Enter; OpenCode queue + followup dock |
| 7 | Permission **mode / agent mode** must be visible and switchable (Manual / plan / auto / read-only). | **loop-breaking** for plan workflows; else **supervision** | Claude Shift+Tab; Codex `/permissions` `/plan`; OpenCode Tab agents |
| 8 | Compaction (auto or manual) must exist and be **visible** when history is replaced. | **loop-breaking** at context limit; **supervision** for awareness | Claude `/compact`; Codex `/compact`; OpenCode compaction part + keybind |
| 9 | Session **resume/list** must restore transcript continuity. | **loop-breaking** for multi-day work; **ergonomic** for single shot | All three resume docs |
| 10 | Plan/read-only must **prevent source edits** until exit/approve (unless bypass sandbox). | **loop-breaking** for “plan then edit” contract | Claude plan mode; OpenCode plan agent; Codex read-only/`/plan` |
| 11 | Images and `@` file mentions must enter the same turn context as text. | **ergonomic** → **supervision** for visual bugs | Claude paste/`@`; Codex image+`@`; OpenCode FilePart/ImagePreview |
| 12 | Agent todo/checklist should surface multi-step progress. | **supervision** / **ergonomic** | Claude Ctrl+T; OpenCode todowrite dock |
| 13 | Cost/context indicators prevent silent spend/context death. | **supervision** / **ergonomic** | Claude `/usage` `/context`; Codex `/status` `/usage` |
| 14 | Reject/deny path must feed back into the agent (reason or blocked). | **loop-breaking** if deny deadlocks without model notice | OpenCode reject message; Claude classifier deny → alternative; Codex auto-review deny |
| 15 | Sandbox/bypass products may omit per-tool prompts **only if** an enforced boundary remains. | conditional **loop-breaking** | Claude bypassPermissions container warning; Codex never+danger-full-access; OpenCode `--auto` still honors deny |

---

## Files Read / URLs fetched

### OpenCode
- https://github.com/anomalyco/opencode (repo)
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/session-ui/src/components/message-part.tsx (`37fe5c83dc13`)
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/app/src/pages/session/composer/session-permission-dock.tsx
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/app/src/pages/session/composer/session-followup-dock.tsx
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/app/src/pages/session/composer/session-todo-dock.tsx
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/tui/src/routes/session/permission.tsx
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/tui/src/config/keybind.ts
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/cli/cmd/run/runtime.queue.ts
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/core/src/session/compaction.ts
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/session-ui/src/components/session-diff.ts
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/agents/
- https://opencode.ai/v2/docs/compaction (search/snippet)
- Older snapshot: https://raw.githubusercontent.com/anomalyco/opencode/ec3ae17e/packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx

### Claude Code
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/how-claude-code-works
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/costs
- Search hits: commands, context-window, best-practices

### Codex
- https://developers.openai.com/codex/agent-approvals-security.md
- https://developers.openai.com/codex/concepts/sandboxing.md
- https://developers.openai.com/codex/concepts/sandboxing/auto-review.md
- https://developers.openai.com/codex/cli/slash-commands.md
- https://developers.openai.com/codex/config-basic.md
- https://developers.openai.com/codex/prompting.md
- https://developers.openai.com/codex/cli/features.md

### Method notes
- Some `developers.openai.com` WebFetch calls timed out; content retrieved via `curl` `.md` URLs.
- GitHub code search API required auth; tree listing via `/git/trees/dev?recursive=1` used instead.
