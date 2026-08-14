# OpenBot M0–M6 orchestrated build — independent judgment

**Date:** 2026-08-15
**What this is:** A fresh-context judge pass on the claim that coding milestones **M0–M6** of `planning/boxbot-local-plan.md` were implemented end-to-end (M7 and `m1-smoke-max-pro` deferred). The judge did not write any of the work and did not reuse the implementer's conclusions.
**Repo:** `/Users/aadivyar/Documents/Startups/grok-bot-clone` — GitHub `https://github.com/aadivyaraushan/botbox`
**State judged:** `origin/main` @ `bbbaace1cb37f2c11ca39ddbb280f1eb34744fc7` (verified via `git ls-remote`), inspected through the linked worktree `~/Documents/Startups/grok-bot-clone-wt-m6` (same SHA family, `git status` clean).

---

## Verdict

**FAIL** — not because little was built (a lot was, and most of it is good), but because three things that the plan makes non-negotiable are untrue:

1. The **packaged app from M2b cannot start its own background program**, so the artifact that M7 is supposed to run on does not work. Nobody noticed because the M2b step that would have caught it was skipped.
2. **No milestone's real-harness verification step was ever completed.** Not one real Claude turn, not one real agent-driven browser or terminal action, not one two-agent message through the product. Every ledger row is stamped `unit-test-verified`, yet the units are marked `done`.
3. Several **plan-locked, user-visible behaviors are simply absent** from the thread UI (reasoning collapse, tool output, "Stopped." / "Something went wrong.", follow-the-stream scrolling), and one explicit "do not do this" instruction was done anyway.

The plan and the workspace rules both say the same thing about case 2: if the real surface cannot be reached, **block the milestone; do not skip**. It was skipped, using an unanswered gate whose default was "defer and continue".

---

## The bar I set before looking at the work

Derived from the plan (§8 build order, §2 copy-these, §3.5 mechanisms), `AGENTS.md`, and the workspace rules on real-surface verification, tests-before-implementation, and never shipping bad UX. A strong result would have:

1. **Every milestone's own "Done when" sentence literally true**, or the milestone openly marked blocked with the blocker named and escalated to the user — never marked done on partial evidence.
2. **Tests written before code, at the layers the plan names**, with each enumerated assertion actually asserted — and no test that cannot fail.
3. **Real-surface evidence, not proxies.** The plan asks for a real Electron window driven against the real background program and real harnesses. A screenshot of the real window talking to a fake backend is a proxy.
4. **Plan fidelity where the plan is explicit.** Where the plan says "copy this exact behavior" or "do not write a second X", the code matches. Underspecified spots trigger "stop and revise", not improvisation.
5. **Stop-and-revise pins honored.** The plan lists ~12 probes whose failure must halt work (Codex permission keys, `request_user_input`, Hindsight bank create-on-404, Hindsight MCP path, Claude reasoning stream, compact tool array). Each is either resolved with evidence or has stopped the work.
6. **Merged state matches the ledger**, and a person picking this up can reproduce every claim from committed artifacts.
7. **The product runs.** A user can launch it and get one agent doing one piece of real work.

---

## What is genuinely good

Worth saying plainly, because the FAIL is narrow and most of this is keepable.

| Area | Evidence |
|---|---|
| Merged state matches the PR claims | All 11 PRs `MERGED` (`gh pr list --state all`); `origin/main` = `bbbaace` = PR #11's merge commit. M2b (PR #6) exists even though the claim summary omitted it. |
| CI is real and green on the merged head | Last `main` run: jobs `test` **success**, `app-e2e` **success**. Workflow matches §9 (Ubuntu unit job + `macos-14` Playwright `--project=ci`). |
| Unit suites pass and coverage clears the floor | Re-run by me: `pnpm typecheck` exit 0; protocol **56 tests**, 100% lines; daemon **82 tests across 22 files**, **80.75%** lines against a hard `thresholds.lines: 80`. |
| Protocol work (M0) is faithful | `packages/protocol/test/schemas.test.ts` asserts the awkward ones: rejects `peer-rate-limit`, `roleMd`, `plan`, `bot-not-found`, `harness-switch-busy`, `waiting-intervention`, `exitNodeEnabled`, `channel:'meta'`; accepts `event.stream.meta`, `need-name-or-description`, strict `usage`. |
| The Codex path was probed against the real CLI | `packages/daemon/test/fixtures/codex/probe3-write-scope.md` records real `codex-cli 0.147.0` results (Desktop write OK, other-agent write denied, private read denied, other-agent read allowed) with `--strict-config`. `live-verify-summary.txt` records a real app-server turn **and** `exec resume` passing. The exec-mode `request_user_input` rejection was caught and correctly escalated into a plan revision (`probe2-REVISE-TO-APP-SERVER.md`) rather than worked around. |
| Adapter options are real, not invented | I checked the pinned SDK myself: `@anthropic-ai/claude-agent-sdk@0.3.232` (plan floor 0.3.231) has `Options.effort`, `thinking`, `toolAliases`, `includePartialMessages`, `permissionMode`, `resume`. |
| M2a discipline held | `Chrome.tsx` first appears in `22c5c49` ("Add M5 browser and terminal"), not in M2a — exactly what §8 M2a demanded. |
| Hindsight really was bundled | `~/.../grok-bot-clone-wt-m2b/resources/hindsight` = **2.3G** (`bin/`, `python/`, `hf-cache/`); packaged app 2.9G with `Contents/Resources/hindsight/{bin,python,hf-cache}`; `CFBundleIdentifier = com.openbot.app`; ad-hoc signature. Size recorded as §8 M2b step 7 requires. |
| The login-capture failure was diagnosed honestly | `saved-results/openbot-login-wallpaper-screen-recording-2026-08-14.md` correctly roots it in Cursor lacking Screen Recording, admits the wrong escalation to the human, and adds a fail-closed preflight (PR #9). |

---

## Gaps

### G1 — BLOCKER: the packaged app cannot start its background program

The app launches the daemon by spawning a TypeScript runner from what it thinks is the repo:

```102:109:packages/app/src/main/index.ts
function spawnDaemon(adminToken: string): void {
  const root = repoRoot()
  const tsx = join(root, 'node_modules/.bin/tsx')
  const main = join(root, 'packages/daemon/src/main.ts')
  daemonChild = spawn(tsx, [main], {
```

and `repoRoot()` is:

```34:36:packages/app/src/main/index.ts
function repoRoot(): string {
  return join(app.getAppPath(), '../..')
}
```

In the packaged bundle `app.getAppPath()` is `…/OpenBot.app/Contents/Resources/app.asar`, so `../..` is `…/OpenBot.app/Contents`. I searched the built bundle:

```
find …/OpenBot.app/Contents -name tsx -o -name main.ts   → no results
ls …/OpenBot.app/Contents                                 → Frameworks/ Helpers/ MacOS/ Resources/ Info.plist PkgInfo
```

There is no `node_modules/.bin/tsx` and no `packages/daemon/src/main.ts` inside the app. The spawn fails, so the packaged app never connects to a daemon: no team, no agents, no turns. `electron-builder.yml` ships only `resources/hindsight` in `extraResources`, and the daemon has no build output by design (§5.5.4: "No `dist/`").

**Why it slipped:** §8 M2b steps 5, 8 and 9 (re-grant, ad-hoc Allow-click E2E, "launch the ad-hoc signed packaged app, complete one harness login Allow-click end-to-end") were not run. The implementer's own report says so: "Local Allow-click E2E against the packaged binary still needs the re-grant step on this machine" (`orchestrate/openbot/inbox/m2b-packaging-report.md`, Notes for operators). The unit test that stands in for it only reads the YAML and the afterPack script (`packages/app/test/packaging.test.ts`) — it never launches the app.

**Consequence:** M2b's "Done when" is false, and M7 has no working build to run on.

### G2 — BLOCKER: no milestone's real-harness verification was completed

| Milestone | Plan's verify step | What actually happened |
|---|---|---|
| M1 | `node packages/daemon/scripts/smoke.mjs` against real `claude`, **must** see ≥1 `reasoning-text`; then `ask-probe.mjs` | Never run. `saved-results/openbot-m1-daemon-2026-08-14.md:12`: OAuth ends at "Claude Max or Pro is required to connect to Claude Code". Gate `m1-smoke-max-pro` is **still open, unanswered**, default `defer-and-continue` (`orchestrate/openbot/status.md:55`). |
| M3 | "that Playwright file **and** a real Claude Code turn that asks" | Never run. `m3-ask-cards-report.md`: "live Claude ask was blocked in this environment". |
| M4 | "that Playwright file **and** two agents in the real app" | Never run. `m4-peer-markers-report.md`: "Real-surface uses the Electron window against the fake peer scenario… Live two-harness MCP send was not required for marker rendering." That is the implementer overruling the plan's verify step. |
| M5 | ten-item live list: agent navigates → `needs-site` → allow → page loads; second tab fronts; click page → You're driving → Return control → agent continues; window closed + `stayHidden`; agent shell command opens a visible Terminal without stealing focus; `terminal_read` sees your typed output; cleanup | Not done. The "real-surface" script drives the real window against the **fake** daemon and does none of these — see `packages/app/e2e/real-window-drive.mjs:11-24` (`spawn(… e2e/fake-daemon.ts)`, `OPENBOT_DAEMON_WS=…scenario=browser`, `OPENBOT_ALLOW_INTEL=1`). Its whole check list is "is this element visible". |
| M6 | "a real-window drive against the **real** daemon (not only the fake)" | Closest to done: the report describes a real `Daemon` on `127.0.0.1:18844`. But it ran with `skipHindsightSpawn: true` (memory off), and **the script is not in the repo** — `playwright.config.ts:16` ignores `**/files-real-surface.spec.ts` and that file does not exist on `origin/main`. Unreproducible. |
| M2b | ad-hoc packaged app + Allow-click login end-to-end | See G1. |

The Claude-account blocker is genuinely external and was fair to escalate. Marking the milestones **done** on the back of it was not. Every ledger verdict reads `unit-test-verified` (`status.md:27-41`) — the ledger is internally honest, and the "M0–M6 done" claim on top of it is not.

Also unresolved, and pinned in the plan as **stop and revise**:
- Claude reasoning stream ever arriving (M1 smoke) — untested, so the `thinking: { type:'adaptive' }` fallback decision was never made.
- Compact one-shot's empty `tools` array actually restricting tools — never observed against a real SDK.
- The Claude credential shape: `resolveLlmProvider` decides the memory provider by testing whether `claude-config/.credentials.json` exists (`hindsight-spawn.test.ts:70-75`), but the M3 report found this Mac's Claude login is **Keychain-only and does not transfer under `CLAUDE_CONFIG_DIR`**. That is the plan's "login credential probe inversion" pin, hit and not folded back.

### G3 — BLOCKER: Hindsight's product path has never been exercised

- The only live check is a boot probe inside the bundler: `scripts/dev/bundle-hindsight.sh:78-87` polls `/`, `/health`, `/docs` and calls it "smoke ok". No retain, no recall, no bank create-on-404, no MCP path check.
- The two Hindsight stop-and-revise pins are therefore unresolved: "first retain on a new bank 404 → `PUT`; if PUT also 404s, **stop and revise**" and "if the Hindsight MCP path 404s, **stop and revise**" (plan §3.5, Memory load and write).
- That smoke also runs with `HINDSIGHT_API_LLM_PROVIDER=openai` and `HINDSIGHT_API_LLM_API_KEY=smoke-placeholder` (`bundle-hindsight.sh:69-71`), while the product config is `claude-code`/`openai-codex` with **no extra API key** (plan §3.5; `AGENTS.md`). The configuration the product will actually use was never started.
- The dev install the plan asks for in M1 does not exist on this machine: `ls ~/.openbot/hindsight` → only `codex/`. No `bin/`, `python/`, `hf-cache/`, or `data/`. So no dev run of the app has ever had working memory, which fits M6 verifying with `skipHindsightSpawn: true`.
- The recorded pin does not match the tree it claims to fingerprint. `packages/daemon/src/memory/hindsight-pin.json` says `treeSha256: 362476cd1b6f96…`; recomputing with the script's own method over `wt-m2b/resources/hindsight` gives `1d59ead6e5a47e…` — twice, identically, so this is not run-to-run noise. Separately, the method itself is broken: `find … | xargs shasum` drops any file whose name contains a space, and four such files exist (e.g. `scipy/io/tests/data/Transparent Busy.ani`), so the fingerprint silently ignores them.

### G4 — plan-locked thread UI that was never built

The whole trace surface is 136 lines and renders every part as a plain, always-open `div`:

```80:93:packages/app/src/renderer/thread/PartTimeline.tsx
              if (p.type === 'reasoning') {
                return (
                  <div key={p.id} className="part-row reasoning" data-testid="reasoning-row">
                    {p.text}
                  </div>
                )
              }
              if (p.type === 'tool') {
                return (
                  <div key={p.id} className="part-row tool" data-testid="tool-row">
                    {p.name}: {p.inputSummary}
                  </div>
                )
              }
```

Missing against §2.2, each one a "copy this" row, not a nice-to-have:

| Required | Status |
|---|---|
| Reasoning row expanded while streaming, **collapsed when the turn finishes**, summary = first 80 chars or `Thought`, click toggles | Absent — always fully expanded, no toggle. |
| Tool row expands to show `outputSummary` | Absent — `outputSummary` is never rendered. The renderer does not even handle `tool-result` (no such branch in `App.tsx`), so a tool's success/failure never reaches the screen. |
| The write-deny row the user is supposed to see (`ok:false`, "Cannot write another agent's folder.") | Unreachable in the UI, because of the line above. The deny logic is correct and tested in `write-deny.test.ts`; the user just can't see it fire. |
| `outcome:'interrupted'` → muted **Stopped.**; `outcome:'error'` → **Something went wrong.** + `errorMessage` in mono | Absent — `rg "Stopped\.|Something went wrong" packages/app/src` returns nothing. Interrupted and failed turns end in silence, which is exactly the "silent fail" the plan forbids. |
| Stick to bottom while streaming; release after 80px of user scroll; **Jump to latest** chip | Absent — `rg "scroll" packages/app/src/renderer/**` returns nothing. A streaming turn will run off-screen. |
| **Ctrl+L** clears the focused Terminal (§2.4, and an explicit M5 test) | Absent — `App.tsx:441-458` handles Ctrl+`` ` ``, Cmd+P and Cmd+W only; `TerminalPane.tsx` has no key handling. |
| Address bar suggests from this browser's history, else searches Google (§2.4) | Absent — no `google.com/search`, no suggestion code anywhere. |
| Quit / **Pause all** protective modal when an agent has an open ask card ("An agent is waiting on you", **Open OpenBot** / **Stop and quit** / **Pause the others**) (§3.5, and an M2 bullet) | Absent — the only dialogs in `main/index.ts` are the first-close tip (191) and the Intel gate (205); `before-quit` (311) kills the daemon unconditionally. So quitting while an agent waits on you silently discards it. |
| First-use memory progress **Setting up memory…** (§3.5 "First-use UI (M2)") | Absent — string does not exist. The `memory-error` banner path does exist. |

### G5 — an explicit "do not" was done anyway

Plan §3.5: later envelopes for a turn already on screen must be folded by calling `applyEvent` from `@openbot/daemon/turns` — "**do not** write a second fold in the app". The renderer imports nothing from the daemon (`rg "import .*daemon" packages/app/src/renderer/App.tsx` → no matches) and hand-rolls its own fold at `App.tsx:256-339` (`turn-created`, `reasoning-text`, `assistant-text`, `tool-use`, `compacted`, `ask-user-question`, …). That is how `tool-result` came to be dropped in G4: the daemon's reducer handles it, the app's copy does not. Two folds, already diverged.

### G6 — tests that cannot fail, and one that asserts nothing

- **A swallowed failure.** M5's "a `browser.exec` with no Browser tab makes a visible tab appear" is wrapped so that failure silently falls back to the menu path and the test still passes:

```100:106:packages/app/e2e/browser.spec.ts
    try {
      await expect(page.getByTestId('tab-browser')).toBeVisible({ timeout: 8_000 })
    } catch {
      // Fallback visibility path: menu open still works (covered above); force via menu for remainder
      await clickMenu(app, ['View', 'Browser'])
      await expect(page.getByTestId('tab-browser')).toBeVisible()
    }
```

  The M5 report even names the reason ("`browser.exec` auto-opening a visible tab can be flaky in e2e"). A flaky requirement was converted into an unfalsifiable test instead of being fixed.
- **A tautology.** The plan wants "navigate to `https://example.com` → banner → allow-site → URL bar shows example.com". The test fills the URL box and asserts the URL box contains what was typed (`browser.spec.ts:82-83`, comment: "navigate kicked; do not block on network"). It verifies React, not navigation.
- **Click-to-drive is untested.** The plan's rule is that a click **inside the page** takes control. The test clicks the `take-control` button instead (`browser.spec.ts:86`). The real path (`before-mouse-event` in `browser-views.ts`) has no coverage.
- **One giant test per spec.** `app.spec.ts` is a **single** `test()` covering ~30 plan-listed behaviors, and `browser.spec.ts` / `files.spec.ts` are one each. The first failure hides everything after it.
- **Suite flakiness reproduced.** Full local run on the merged head: **11 passed, 1 failed** (`ask.spec.ts:58` "two-question card waits for second answer"). Run in isolation, `ask.spec.ts` is **6/6 green**, so it is order- or shared-state-dependent, not a code defect. (Note: my first full run failed 12/12 because a fake daemon I had left on port 18799 was reused via `reuseExistingServer`; I killed it and re-ran — the 11/1 result is the clean one.)
- **Thin spots against the plan's enumerated lists.** `ask.test.ts` is 2 tests for ~8 required assertions; `team.test.ts` 1 for ~8; `mcp.test.ts` 1 for ~6; `resume.test.ts` 1 for 3. Several named assertions have no trace anywhere: the "no peer rate limit" test (7+ peer turns in an hour still succeed) — `rg "rate-limit" packages/daemon/test` → nothing; the port-busy case that must rewrite Codex `config.toml` to the fallback port (`hindsight-spawn.test.ts:43-68` checks the port only); the `MEMORY.md` ≤16 000-char cap (the constant exists at `snapshot.ts:7`; no test asserts it).

### G7 — smaller plan deviations

| Item | Plan | Built |
|---|---|---|
| Cross-agent browser guard | "`browser.exec` `agentId` must equal the path or the tool returns `wrong-agent`" (§3.5) | `rg "wrong-agent"` across `packages/*/src` → **nothing**. Not implemented, not tested. |
| Admin token | App generates once, encrypts via `safeStorage` (or 0600 plaintext) into `userData/admin-token.bin`, re-reads on launch (§3.5) | `rg "safeStorage|admin-token.bin"` → **nothing**. `index.ts:305` does `process.env.OPENBOT_ADMIN_TOKEN ?? randomBytes(32)`, never persisted. |
| Daemon file layout | §5.5.4 lists the exact tree; there is no `daemon.ts` in it | `packages/daemon/src/daemon.ts` is **1 987 lines** and holds the orchestration. Also collides with the workspace rule against wide god files. Its coverage is the suite's weakest at **71.79%** lines. |
| Coverage scope | "80% line floor on `src/**/*.ts`" | `packages/daemon/vitest.config.ts` excludes `src/main.ts` and `src/login/parse.ts`. Not gaming (both are exercised; excluding a well-covered file lowers the average) but it is a narrowed contract, undeclared in the reports. |
| Intel gate | `!isAppleSilicon()` → blocking copy, do not start daemon | `index.ts:204` adds an `OPENBOT_ALLOW_INTEL=1` bypass so tests can run. Defensible as a test seam; it is still a new escape hatch the plan does not have. |
| Dead code | — | `Composer.tsx:159`: `if (primary === 'paused' as never) return` — `Primary` has no `'paused'`, so this never fires. The real Enter-while-paused guard lives at `App.tsx:611-612`. |
| CI command shape | §9: `pnpm --filter @openbot/app test:e2e -- --project=ci` | `.github/workflows/ci.yml` uses `exec playwright test --project=ci`. Equivalent; harmless. |
| Ledger completeness | — | PR #9 (login preflight guard) is merged but appears in **neither** the units table nor the verification ledger in `status.md`. |

### G8 — the handoff itself is broken

The primary checkout is stale and will not update cleanly:

- Local `main` is at `f624a0f` (**2 commits**), while `origin/main` is `bbbaace`. Fast-forwardable, but:
- The working tree holds **untracked copies** of files that now exist on `origin/main` — `.github/workflows/ci.yml`, `pnpm-lock.yaml`, `package.json`, `tsconfig.base.json`, `packages/protocol/**`. A `git pull` will refuse: "untracked working tree files would be overwritten".
- `git diff origin/main` against this tree reports **210 files / 23 330 lines** absent locally. All 11 milestone worktrees still exist beside the repo, each pinning a branch.
- The claimed checkpoint `saved-results/openbot-orch-program-2026-08-14.md` is **not on `origin/main`** (only untracked locally), and neither is any M3 milestone note, so the M3 story lives only in the private orchestrate inbox.

---

## What the next engineer must do

Ordered by what unblocks the most.

1. **Make the packaged app able to start the daemon** (G1). Either compile the daemon into the app bundle, or ship it plus its runner via `extraResources` and resolve the path from `process.resourcesPath` in packaged mode. Then add a test that launches the built `.app` and asserts a daemon connection — the current packaging test cannot catch this class of bug.
2. **Re-open M2b, M5, M4, M3, M1 as blocked, not done** (G2), and rewrite `status.md` so the unit state matches the ledger verdicts. Then run the verify lists as written: M5's ten live browser/terminal steps, M4's two real agents, M3's real ask card, M2b's Allow-click after re-grant.
3. **Exercise Hindsight for real once** (G3): install the dev tree at `~/.openbot/hindsight`, start it with the product's own provider settings and no API key, then do one retain, one recall, one first-retain-404, and one MCP path fetch. Two of those four are plan-level stop-and-revise pins. Fix `treeSha256` (hash with a space-safe method) and recompute it against the tree that actually ships.
4. **Build the missing thread UI** (G4) — reasoning collapse, tool output on expand, `tool-result` handling, "Stopped." / "Something went wrong.", stick-to-bottom + Jump to latest, Ctrl+L, the quit/Pause-all protective modal, "Setting up memory…". Until `tool-result` renders, the write-deny protection is invisible to the user, which is the opposite of what the plan asks for.
5. **Delete the app's second event fold** (G5) and import `applyEvent` from `@openbot/daemon/turns`, as §3.5 requires. Doing this first makes item 4's `tool-result` work fall out for free.
6. **Fix the tests that cannot fail** (G6): remove the `try/catch` in `browser.spec.ts`, assert real navigation instead of the input's value, drive click-to-drive through the page, split the mega-tests, and isolate fake-daemon state per test so the full suite is not order-dependent. Add the missing named assertions (no-peer-rate-limit, config rewrite on port fallback, `MEMORY.md` cap).
7. **Add the `wrong-agent` guard and the persisted admin token** (G7). Consider splitting `daemon.ts`.
8. **Repair the checkout** (G8): move or delete the stale untracked copies in the primary tree, `git pull`, prune the 11 finished worktrees, and commit the orchestrate checkpoint plus an M3 note into `saved-results/` so the record is in the repo rather than a private store.

## What the user must decide

1. **Claude Code Max/Pro.** Gate `m1-smoke-max-pro` is still open and unanswered. Without that subscription, M1's smoke, M3's real ask, and every Claude-side stop-and-revise pin stay unverifiable — and the default harness is Claude (`claude-sonnet-5`). Either buy the seat, or accept Codex-only for v1 and say so in the plan.
2. **Screen Recording for the tool that drives login.** The preflight still exits 2 (`openbot-login-wallpaper-screen-recording-2026-08-14.md`). Until Cursor has Screen Recording, the "OpenBot clicks Allow itself" path cannot be demonstrated, which blocks M2b step 9 and M7.
3. **The Claude credential assumption.** This Mac's Claude login is Keychain-only and does not carry under `CLAUDE_CONFIG_DIR`, but the code decides the memory provider by looking for `claude-config/.credentials.json`. That is a plan-level "stop and revise". Decide whether OpenBot gets its own Claude login inside `~/.openbot/claude-config`, or the detection changes.
4. **M7 scheduling.** Correctly deferred, but it cannot run until item 1 of the engineer list is fixed — the ad-hoc build it is supposed to run on does not currently start.

---

## How I checked (reproduce)

```bash
# merged state
git ls-remote --heads origin
gh pr list --state all --limit 30 --json number,state,mergedAt,mergeCommit
gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId' | xargs -I{} gh run view {} --json jobs

# tests on the merged head (worktree at bbbaace family, git status clean)
cd ~/Documents/Startups/grok-bot-clone-wt-m6
pnpm typecheck                                                        # exit 0
pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage
#   protocol 56 tests / 100% lines; daemon 82 tests / 80.75% lines
pnpm --filter @openbot/app exec playwright test --project=ci --reporter=line
#   11 passed, 1 failed (ask.spec.ts:58) — kill any stale fake daemon on 18799 first
pnpm --filter @openbot/app exec playwright test --project=ci e2e/ask.spec.ts   # 6/6 green in isolation

# packaged app cannot reach its daemon
B=~/Documents/Startups/grok-bot-clone-wt-m2b/packages/app/dist/mac-arm64/OpenBot.app/Contents
find "$B" -name tsx -o -name main.ts        # no results
codesign -dv "$B/.."                        # adhoc, linker-signed, Identifier=Electron

# hindsight pin mismatch (deterministic across two runs)
cd ~/Documents/Startups/grok-bot-clone-wt-m2b
find resources/hindsight -type f | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256
#   1d59ead6e5a47e5b9f60edc03341aeda3747bfdc4e86d7facbef0c6b9c229753
#   pin says 362476cd1b6f966ec7529030220794e2711560619a189df3f0fef32d688b9352

# dev hindsight never installed
ls ~/.openbot/hindsight                     # only: codex/
```

Searches that returned **nothing**, and what that rules out: `wrong-agent` (cross-agent browser guard), `safeStorage|admin-token.bin` (token persistence), `Stopped\.|Something went wrong` (interrupted/error rows), `scroll` in the renderer (stick-to-bottom), `google.com/search|suggest` (address bar), `An agent is waiting on you|Pause the others|Stop and quit` (protective modal), `Setting up memory` (first-use progress), `Jump to latest`, `rate-limit` in the daemon tests, `import .*daemon` in `App.tsx` (the forbidden second fold), and `files-real-surface.spec.ts` on `origin/main` (M6's real-surface script).

**Scope of this pass:** read-only apart from this file. I did not implement or propose patches, and I killed only a leftover test process of my own making.
