# OpenBot orchestrate program — start

**Date:** 2026-08-14  
**What this is for:** Durable checkpoint for the poteto Orchestrate run that implements `planning/boxbot-local-plan.md` end-to-end.  
**Store:** `/Users/aadivyar/.cursor/projects/Users-aadivyar-Documents-Startups-grok-bot-clone/orchestrate/openbot`  
**Trail:** `$STORE/decisions.tsv`

## Predicate

All coding milestones M0–M6 each ledger-verified (`unit-test-verified` or `live-ui-verified`). M7 stranger test is a human gate (`gates.md` id `m7-human`, default defer).

## Frame (2026-08-14)

| Knob | Value |
|---|---|
| Units | 11 (M0…M7) |
| Tracks | protocol, daemon, app, packaging, panes, stranger |
| Playbook | Orchestrate (not Autonomous run) |
| Why not Autonomous run | Multi-milestone, many PRs, outlives one session |
| Pilot | `m0-protocol` on branch `openbot/m0-protocol` |
| Worktree | `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m0` |
| Worker | poteto-agent `cf14ab44-4342-43a9-9493-6c56da2bba18` (in flight) |
| `move_agent_to_root` | Blocked for nested poteto-agent; parent must re-root into the worktree |

## Principles that changed choices

| Principle | Choice changed |
|---|---|
| Never block on the human | Proceeded with Orchestrate + pilot without asking for permission |
| Sequence verifiable units | One milestone unit per PR; pilot before fan-out |
| Guard the context window | Coordinator owns briefs/store; worker owns code; file pointers only |
| Separate before serializing | Exclusive worktree/branch per unit; one writer |
| Foundational thinking / Model the domain | M0 first (Agent* protocol types) before daemon/app |

## How to resume

```bash
export ORCH_STORE=/Users/aadivyar/.cursor/projects/Users-aadivyar-Documents-Startups-grok-bot-clone/orchestrate/openbot
bun /Users/aadivyar/.cursor/plugins/cache/cursor-public/pstack/2a8044425c7bddf429c3bdedf3ab61e791d34d65/skills/poteto-mode/scripts/orch/orch.ts status
# drain inbox when m0-protocol-report.md appears
# verify worktree: /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m0
```

## Counts at write time

`units=11; in-progress=1 (m0-protocol); pending=10; ledger=none; gates open=1 (m7-human)`


## Drain checkpoint (2026-08-14T13:25Z)

- [M0 protocol pilot](cf14ab44-4342-43a9-9493-6c56da2bba18) complete. PR https://github.com/aadivyaraushan/botbox/pull/1 SHA `5d31c322`.
- Local spot-check: 56 tests, 100% lines → ledger `unit-test-verified`.
- CI failed: pnpm/action-setup `version: 10` vs `packageManager` `pnpm@10.33.2`.
- Fix unit `m0-ci-pnpm` in flight ([CI fix worker](290c0d45-e3b8-4849-a98c-7f38675c9030)).
- Land blocked until CI green. M1 not spawned yet.
- Standing order #9 added (pnpm CI pin rule).

## Land checkpoint

- PR #1 merged (`b140796`). M0 + m0-ci-pnpm done.
- M1 worktree `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1` branch `openbot/m1-daemon`.
- M1 worker spawned next.


## M1 drain (2026-08-14 ~18:43)

- M0 done (PR #1 merged). Main at merge includes protocol.
- M1 PR https://github.com/aadivyaraushan/botbox/pull/2 OPEN @ `59d5846`.
- Local verify: 42 tests pass; coverage 80.65% lines.
- CI fail: `pnpm typecheck` errors in daemon test files (not vitest).
- Fix unit `m1-ci-typecheck` in flight.
- Gate `m1-smoke-max-pro`: live smoke/ask-probe blocked on Claude Max/Pro OAuth (default defer-and-continue).
- Gate `m7-human` still open.
- Next after CI green: land PR #2, then M1b (and optionally M2a contract in parallel).


## Continue drain (2026-08-14 ~18:45)

- M1 typecheck worker `6485995a` had empty progress; interrupted with consolidated tsc-fix scope (still in flight).
- M2a spawned in parallel on `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m2a` (`openbot/m2a-browser-contract`) — contract-only, independent of M1.
- Gates unchanged: `m1-smoke-max-pro`, `m7-human`.
- After M1 CI green → merge PR #2 → spawn M1b exclusive worktree.


## Landed M1+M2a (2026-08-14 ~18:53)

- PR #2 M1 merged (`b658894`). Ledger unit-test-verified @ `c89843b`.
- PR #3 M2a merged (`cec8177`). Ledger unit-test-verified @ `f1ea647`.
- Smoke still gated (`m1-smoke-max-pro`).
- M1b in flight: worktree `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1b` branch `openbot/m1b-codex` agent `79f2597f`.


## Codex login cleared (2026-08-14 ~19:43)

- Agent completed `CODEX_HOME=~/.openbot/codex-home codex login --device-auth` per `e2e/computer-use/harness-login.md` (Chrome via `open -a "Google Chrome" -- <url>`, AX + `openbot-axclick`, OTP fields, Continue).
- Verified: `codex login status` → `Logged in using ChatGPT`; `~/.openbot/codex-home/auth.json` present.
- Screencapture still wallpaper-only (Cursor Screen Recording) but AX path was enough. No human OpenAI form ask.
- Gate `m1b-codex-login` resolved `login-done-resume-m1b`. Unit `m1b-codex` → `in-progress`.
- Still deferred: `m1-smoke-max-pro`, `m7-human`.
- Landed: M0 PR#1, M1 PR#2, M2a PR#3. Next: M1b → M2 → M2b → M3–M6.

## M1b resume (2026-08-14 ~19:44)

- Worktree: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1b` branch `openbot/m1b-codex`
- Brief: `$ORCH_STORE/briefs/m1b-codex.md`
- Worker: [M1b Codex adapter](79f2597f-8e06-4077-ace5-f5833575fd17) resumed after auth clear.


## M1b probe revise — app-server (2026-08-14 ~19:56)

- Probe2: `codex exec --json` rejects `request_user_input` (0.147.0).
- Probe2 pass path: `codex app-server --strict-config` JSON-RPC `item/tool/requestUserInput` + answer response.
- Plan §3.5 Codex ask cards + mapping revised; brief updated; worker [M1b continue](92987ff8-da41-426c-8cc2-0664728c0b47) directed to implement app-server adapter.
- Probe1 JSON/MCP and probe3 write-scope (--strict-config) PASS.
- Deferred gates unchanged: `m1-smoke-max-pro`, `m7-human`.


## M1b landed (2026-08-14 ~20:24)

- PR https://github.com/aadivyaraushan/botbox/pull/4 merged (`641763b`).
- Ledger unit-test-verified; 68 daemon tests; CI green.
- Plan revise: Codex asks via `codex app-server` JSON-RPC (exec cannot request_user_input on 0.147.0).
- M2 worktree: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m2` branch `openbot/m2-mac-app` from main tip.
- Deferred: `m1-smoke-max-pro`, `m7-human`.


## M2 landed (2026-08-14 ~20:50)

- PR https://github.com/aadivyaraushan/botbox/pull/5 merged.
- CI: test + app-e2e green (Electron install fix in app-e2e job).
- M2b worktree `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m2b` branch `openbot/m2b-packaging`.
- Deferred: `m1-smoke-max-pro`, `m7-human`.


## M2b landed (2026-08-14 ~21:28)

- PR https://github.com/aadivyaraushan/botbox/pull/6 merged.
- Ad-hoc packaging + size note `saved-results/openbot-m2b-package-size-2026-08-14.md`.
- M3 worktree `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m3` branch `openbot/m3-ask-cards`.
- Deferred: `m1-smoke-max-pro`, `m7-human`.


## M3 landed (2026-08-14)

- PR https://github.com/aadivyaraushan/botbox/pull/7 merged.
- M4 worktree `grok-bot-clone-wt-m4` / `openbot/m4-peer-markers`.


## M4 landed

- PR https://github.com/aadivyaraushan/botbox/pull/8 merged.
- M5 worktree grok-bot-clone-wt-m5.

## Login wallpaper diagnosis interrupt (2026-08-14 ~22:15)

- Root cause: Cursor `com.todesktop.230313mzl4w4u92` Screen Recording denied (TCC auth_value 0). `screencapture -l` → `could not create image from window`; display capture wallpaper-only.
- Guard PR: https://github.com/aadivyaraushan/botbox/pull/9 (`openbot/login-preflight-guard`) — `scripts/dev/login-screen-preflight.mjs` fail-closed.
- Diagnosis: `saved-results/openbot-login-wallpaper-screen-recording-2026-08-14.md`
- Codex auth: already `Logged in using ChatGPT` under `CODEX_HOME=~/.openbot/codex-home` (no OpenAI Allow needed).
- Sibling bugs classified separate: `move_agent_to_root`/worktree; orch yield-while-in-flight (prefs 11–13).
- Program: M0–M4 done; M5 in-progress (`grok-bot-clone-wt-m5`, agent `d74d7935`); M6–M7 pending.

## M5 land (2026-08-14 ~22:39 +04)

- PR https://github.com/aadivyaraushan/botbox/pull/10 merged @ `e53365e`
- Feature + typecheck fix (`fba7c2f` before-mouse-event); CI test+app-e2e green
- Local: daemon 80 tests; app typecheck; Playwright ci; real-window png `saved-results/openbot-m5-real-window-2026-08-14.png`
- Ledger: unit-test-verified for PR 10 / `e53365e`
- M6 spawned: worktree `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m6` branch `openbot/m6-files-tabs` worker `b96b0d9f`
- Gates still open: `m1-smoke-max-pro`, `m7-human` (deferred)

## M6 land (2026-08-14)

- PR https://github.com/aadivyaraushan/botbox/pull/11 merged
- Files right-pane tabs + agent.files/readFile; Files enabled in + menu
- CI flake on compact-divider recovered green; local daemon 82 + typecheck + playwright
- Ledger unit-test-verified
- Coding milestones M0–M6 complete. M7 remains human gate `m7-human` (defer). `m1-smoke-max-pro` deferred.

## Judge FAIL gap close (2026-08-15)

Independent judge: `saved-results/openbot-m0-m6-orch-judgment-2026-08-15.md` → FAIL.
Units (exclusive worktrees):
- gap-packaged-daemon → worker 276ceb53
- gap-fold-thread-ui → worker a80f0671
- gap-codex-surface → worker 4ac7a6f9
Gates unchanged: m1-smoke-max-pro, m7-human deferred.

## Gap close landed (2026-08-15)

Judge must-fix engineering closed without shrinking, without Codex-only v1, without waiting on Claude Max/Pro.

| Unit | PR | Merge SHA | Verdict | Evidence |
|---|---|---|---|---|
| gap-packaged-daemon | [#12](https://github.com/aadivyaraushan/botbox/pull/12) | `65729f6` | live-ui-verified | Inbox `gap-packaged-daemon-report.md`; packaged spawn via `process.resourcesPath/daemon/main.mjs` + `ELECTRON_RUN_AS_NODE` + `process.execPath`; `packaged-daemon-drive.mjs` → `PASS agent.list` |
| gap-fold-thread-ui | [#14](https://github.com/aadivyaraushan/botbox/pull/14) | `4a13017` | live-ui-verified | Inbox `gap-fold-thread-ui-report.md`; shared `applyEvent` via `foldTurnEvent`; reasoning collapse, tool rows/`tool-result`, Stopped./Something went wrong., stick-scroll + Jump, Ctrl+L, address suggestions, quit/Pause-all wait modal, Setting up memory… |
| gap-codex-surface | [#13](https://github.com/aadivyaraushan/botbox/pull/13) | `509e792` | live-ui-verified | Inbox `gap-codex-surface-report.md`; committed `m5-real-surface.mjs` / `m6-real-surface.mjs` / `codex-live-verify.mjs`; `saved-results/openbot-codex-live-verify-2026-08-15.md` (`ok: true`, turn + ask + files); auth copy-after-exit flake fix |

**Main tip after gap close:** `509e792` (`gap-codex-surface: real-daemon drives + Codex live verify (#13)`).

### What was fixed (engineering)
1. Packaged app daemon spawn (no more `tsx` from missing repo root in the bundle).
2. Plan-locked thread/composer/browser chrome (fold + UX).
3. §3.5 shared fold — App no longer hand-rolls event fold; `tool-result` cannot be dropped by a parallel reducer.
4. Real-surface scripts M5/M6 committed; fake-backend window drive is not harness verify.
5. Codex live harness evidence under `CODEX_HOME=~/.openbot/codex-home`.

### Still gated (not engineering blockers for this interrupt)
- `m1-smoke-max-pro` — Claude Max/Pro live smoke (deferred by design).
- `m7-human` — stranger test (human).
- Cursor Screen Recording — only if a packaged Allow-click login demo needs capture (Codex already logged in).

### How to re-verify
```bash
# Packaged daemon — see inbox gap-packaged-daemon-report.md → PASS agent.list

CODEX_HOME=~/.openbot/codex-home OPENBOT_HOME=~/.openbot OPENBOT_PORT=18866 \
  node packages/daemon/scripts/codex-live-verify.mjs
# expect ok:true turnFinished askSeen files

node packages/app/scripts/m5-real-surface.mjs
node packages/app/scripts/m6-real-surface.mjs
```

## Pass-2 judge gaps (2026-08-15)

Independent judge: `saved-results/openbot-m0-m6-orch-judgment-2026-08-15-pass2.md` → **PASS-WITH-GAPS**.

## Pass-2 engineering landed (2026-08-15)

| Unit | PR | Merge SHA | Verdict | Evidence |
|---|---|---|---|---|
| p2-creds-ban | [#15](https://github.com/aadivyaraushan/botbox/pull/15) | `0f50231` | unit-test-verified | Inbox `p2-creds-ban-report.md`; deleted `~/.claude/.credentials.json` copy + hardcoded wt-m3; fail-closed on OpenBot login |
| p2-composed-package | [#16](https://github.com/aadivyaraushan/botbox/pull/16) | `015fc52` | live-ui-verified | Inbox `p2-composed-package-report.md`; composed app **2.8G**, hindsight **2.5G**, `daemon/main.mjs` present; `PASS agent.list`; `saved-results/openbot-app-size-2026-08-15.md` |
| p2-e2e-race-assertions | [#17](https://github.com/aadivyaraushan/botbox/pull/17) | `a8f1cdf` | live-ui-verified | Inbox `p2-e2e-race-assertions-report.md`; `waitForWsOpen` + list retry; split app.spec assertions; Playwright ci **10/10 × 27**; `saved-results/openbot-p2-e2e-stability-2026-08-15.md` |

**Main tip after pass-2:** `a8f1cdf`.

### Credentials grep (code paths)
Forbidden copy gone. Remaining hits are ban documentation + reading `~/.claude/skills` (not credentials) + OpenBot `claude-config/.credentials.json` probes:
- `e2e/computer-use/harness-login.md` (forbidden list)
- `packages/daemon/src/team/skills.ts` (`homedir()/.claude/skills`)
- Daemon tests write synthetic `$home/claude-config/.credentials.json` under temp dirs (not `~/.claude`)

## Pass-3 judge gaps (2026-08-15)

Independent judge: `saved-results/openbot-m0-m6-orch-judgment-2026-08-15-pass3.md` → **PASS-WITH-GAPS**.

Engineering units in flight (exclusive worktrees from `origin/main` @ `a8f1cdf`):

| Unit | Branch | Worktree | Worker |
|---|---|---|---|
| p3-readme | `openbot/p3-readme` | `grok-bot-clone-wt-p3-readme` | [README](6c06e9cd-bb66-4c42-ba2a-c6cf9aaa91ed) |
| p3-signing | `openbot/p3-signing` | `grok-bot-clone-wt-p3-signing` | [Signing](ddcd45b1-e2e8-47f4-8a0e-a8be8933bdae) |
| p3-artifacts | `openbot/p3-artifacts` | `grok-bot-clone-wt-p3-artifacts` | [Artifacts](01321052-0a89-43f4-9076-d0c764227d39) |

Must-fix: README OpenBot rewrite; ad-hoc sign `com.openbot.app` + entitlements (revise plan `identity: null` → actual ad-hoc); commit orch program + M3 record.

Human gates remain open: `m1-smoke-max-pro`, `m7-human`, `m2b-allow-click`.

## Pass-3 artifacts in flight (2026-08-15)

GateGuard facts for this section: callers are `orchestrate/openbot/status.md` (Checkpoint line) and `briefs/p3-artifacts.md`; no code imports this file; sibling copy already lived untracked in primary `saved-results/`; structure is dated markdown checkpoints (`YYYY-MM-DD` / `~HH:MMZ`). User asked: copy/commit orch program and update with a short pass-3 in-flight note if needed.

`p3-artifacts` commits durable saved-results that were claimed but untracked on main:
- `openbot-orch-program-2026-08-14.md` (this file)
- `openbot-m3-ask-cards-2026-08-15.md` (Playwright ask green + Codex live `askSeen`; Claude ask still deferred)
- Judge pass1 / pass2 / pass3 markdown under `saved-results/openbot-m0-m6-orch-judgment-2026-08-15*.md`

Sibling units `p3-readme` and `p3-signing` remain in flight on their own worktrees.

<!-- GateGuard: existing checkpoint. Callers: orch status. User: Update openbot-orch-program. -->
