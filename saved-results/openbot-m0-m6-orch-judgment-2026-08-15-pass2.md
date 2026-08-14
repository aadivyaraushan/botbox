# OpenBot M0–M6 orchestrate run — independent judgment (pass 2)

**Date:** 2026-08-15
**Judge:** fresh subagent, did not implement the work. Verdict reached from the plan, not from the earlier FAIL list.
**Subject:** autonomous implementation of `planning/boxbot-local-plan.md` (M0–M6 + gap close), repo https://github.com/aadivyaraushan/botbox
**Main tip judged:** `509e792ec5cd77533a249368ce6e479ccfa57e62`
**How I checked:** fresh clone of remote main into `/tmp/openbot-judge`, `pnpm install --frozen-lockfile`, my own test runs, my own probes of the packaged bundles and of the bundled memory server. Nothing in the workspace was modified except this file.

---

## Verdict: **PASS-WITH-GAPS**

The headline claims are true. All 14 pull requests are merged, main really is at `509e792`, CI is green on that commit, and the substance behind the milestones is real code with real tests — not scaffolding. Two of the three things the task told me to be suspicious about held up under direct inspection: the shared event fold is genuinely shared, and the Codex live evidence is a real Codex session, not a proxy. The third — the packaged app — is real but split across two different builds, and no single bundle has ever had both working pieces at once.

The gaps that remain are: an end-to-end test suite that is not reliably green (three runs gave 3, 1, and 0 failures), several plan-named behaviours in the biggest UI test that are clicked but never actually asserted, two milestone "drive the real thing" lists that were only partly driven, and one committed script that does something the plan explicitly forbids.

---

## What a strong result had to look like (worked out before reading the output)

1. **Merged, not claimed.** Every milestone on main, CI green there, no work stranded on branches.
2. **Tests before code, and they hold.** The plan names specific assertions per test file. A strong result has those assertions present, passing, and passing *repeatedly* — a suite that fails one in three runs has not established anything.
3. **The real surface, not a stand-in.** Every milestone with a screen driven through the actual Electron window against the actual daemon; packaging driven through the actual bundle. The plan's own rule: automated tests are not a substitute.
4. **Deviations only where the plan authorised them.** Where the plan says "stop and revise", the plan must actually have been revised — not patched around in code.
5. **Locked user preferences respected.** `AGENTS.md` and the plan forbid specific shortcuts (copying Claude credentials, inventing a second palette, faking a harness). A result that takes a forbidden shortcut to make a check pass is worse than one that reports the blocker.
6. **Honest gates.** Anything blocked by a human or an account must be named as blocked, not quietly marked done.

---

## Verified true (my own evidence)

| Claim | How I verified | Result |
|---|---|---|
| Main at `509e792`, PRs #1–#14 merged | `git ls-remote`, `gh pr list --state all` | All 14 `MERGED`; merge SHAs match the claim (#12 `65729f6`, #14 `4a13017`, #13 `509e792`) |
| CI green on main | `gh run list` | `ci` workflow `success` on `509e792` (both the Ubuntu `test` job and the macOS `app-e2e` job) |
| Protocol tests | `pnpm --filter @openbot/protocol test` | 56 passed |
| Remote-only schemas really stripped | repo-wide search for `tailnetDns`, `setExitNode`, `waiting-intervention`, `peer-rate-limit`, `bot-not-found`, `botId` | Only hits are the *rejection* assertions in `schemas.test.ts`. Clean. |
| Daemon tests + coverage floor | `pnpm --filter @openbot/daemon test --coverage` | 22 files / 82 tests passed; lines **80.83%** (floor is 80% — margin is thin) |
| App unit tests | `pnpm --filter @openbot/app test` | 11 files / 40 tests passed |
| Typecheck | `pnpm typecheck` | protocol + daemon + app all clean |
| CI file matches plan §9 | read `.github/workflows/ci.yml` | Ubuntu job runs the exact coverage filter plus `@openbot/app test`; second job on `macos-14` runs Playwright `--project=ci`. Matches. |
| **Shared fold is really shared** | read `packages/app/src/renderer/thread/fold/fold-turn.ts` | It imports `applyEvent` from `@openbot/daemon/turns` — the same function `daemon.ts` calls in four places. Not a copy. Used from `App.tsx`. |
| **Codex live evidence is real** | read the committed probe fixtures | `live-thread-id.txt` holds a real thread id; `live-exec-resume.jsonl` shows `thread.started` → `agent_message: OPENBOT_M1B_RESUME_OK` → `turn.completed` with real token counts. A real turn **and** the plan-required `codex exec resume` both passed. |
| Codex `request_user_input` stop-and-revise was honoured properly | compared `probe2-REVISE-TO-APP-SERVER.md` against the plan text | Exec mode genuinely cannot ask on CLI 0.147.0; they pivoted to `codex app-server` **and revised the plan** (§2.3 and §3.5, commit `50d97cf`) rather than improvising in code. This is the right behaviour. |
| Codex argv flags | read `packages/daemon/src/codex/exec-argv.ts` vs plan §3.5 | Every flag it passes, including `--dangerously-bypass-hook-trust`, is explicitly listed in the plan. No unauthorised flags; `--sandbox` / `--effort` are actively blocked by an assertion helper. |
| Packaging is real, ad-hoc, correct id | `codesign -dv`, `PlistBuddy` on the M2b bundle | `Signature=adhoc`, `CFBundleIdentifier = com.openbot.app`, helper present at `Contents/Helpers/openbot-axclick` and executable, 2.3 GB real Hindsight in `Contents/Resources/hindsight` |
| Design tokens not reinvented | read `tokens.css`, compared to plan §6, looked at the recorded window screenshot | Palette copied exactly (`--accent: #c4f542` etc.), fonts bundled locally via `@fontsource`. The screenshot is a genuine app window matching those tokens. |
| Capability-first visible shell | read `claude/adapter.ts`, `codex/config.ts` | Prefers `toolAliases: { Bash: 'mcp__openbot__shell_run' }` when the SDK has it, keeps built-in Bash when it doesn't; Codex prefers `shell_tool = false` + MCP. Fallback preserved as the plan requires. |

### Two things I verified that nobody on the implementing side ever did

**The bundled memory server actually works.** I launched `resources/hindsight/bin/hindsight-api` out of the M2b tree with a scratch data directory. It starts offline, connects its database, and answers `/health` with `{"status":"healthy","database":"connected"}`.

**And the daemon's assumptions about that server's HTTP interface are correct.** I hit the exact four endpoints `hindsight-client.ts` uses, by hand, against that live server:

| Call | Result |
|---|---|
| `PUT /v1/default/banks/<id>` | 200, bank created |
| `POST /v1/default/banks/<id>/memories` with `{items:[{content}]}` | 200, `items_count: 1`, real LLM token usage returned |
| `POST .../memories/recall` | 200, `results[].text` present — the shape the client reads |
| `DELETE /v1/default/banks/<id>` | 200 (and the client's 404-means-proceed branch matches the documented behaviour) |

This matters because every memory test in the repo uses a **fake** HTTP client. Fake-client tests cannot catch a wrong URL or a renamed field. They happen to be right — but that was luck confirmed after the fact by me, not by the work.

---

## Gaps

### G1 — The end-to-end suite is not reliably green (engineering)

I ran `playwright test --project=ci` three times on the same clone, same build:

| Run | Result |
|---|---|
| 1 | **14 passed / 3 failed** |
| 2 | **16 passed / 1 failed** |
| 3 | 17 passed / 0 failed |

Different tests failed each time, all with the same root cause: `getByTestId('agent-name').filter({hasText:'Ada'})` never appears within 30 s, so the test times out before it can select the agent. `retries: 0` in `playwright.config.ts`, so a green CI run is partly luck. The M6 report itself documents an earlier CI flake of the same family (`compact-divider` missing, fixed by re-running a selection effect), which corroborates that this is a real race between agent creation and the agent list arriving, not a machine quirk. A suite this shaky cannot carry the "tests before implementation" claim.

### G2 — Plan-named assertions that are clicked but never asserted (engineering)

`packages/app/e2e/app.spec.ts` is **one test with 43 expectations** covering what the plan lists as roughly forty separate behaviours. Bundling them means any early failure hides everything after it. Worse, several plan-required checks are performed as interactions with no assertion attached:

- `/draft` — the plan requires asserting that choosing the fake skill sends `chat.send` with `Draft it.` The test types `/draft`, presses Enter, and asserts nothing.
- **Log in** banner action — the plan requires asserting it sends `harness.startLogin`. The test clicks the button and asserts nothing.
- Enter while thinking, and Enter while memorising — the plan requires asserting the message is queued (and that "Queued" shows). The test asserts only that the primary button keeps its mode; the memorising case asserts nothing at all.
- Rename — the plan requires asserting `agent.get` still returns the same slug. The test only checks the displayed name changed.
- Model picker — the plan requires asserting it is fed by `agent.models` and sends `agent.setModel`. Only "`/model` opens the picker" is checked.
- `needs-you` counting toward tray attention — not asserted anywhere.

`browser.spec.ts` (1 test, 20 expectations) and `files.spec.ts` (1 test, 13 expectations) have the same monolithic shape. `browser.spec.ts` also substitutes a **Take control button click** for the plan's explicit "mouseDown *inside the page* sets held", and skips Ctrl+L-only-while-terminal-focused and the terminal's working directory.

### G3 — No packaged bundle has ever had both real memory and a working daemon (engineering, blocks M7)

There are two ad-hoc bundles on this machine and each is missing what the other has:

| Bundle | Built | Real Hindsight | Daemon in Resources |
|---|---|---|---|
| M2b (`…-wt-m2b`) | Aug 14 21:21 | **yes, 2.3 GB** | **no** — `Resources/daemon/main.mjs` absent |
| gap-packaged (`…-wt-gap-packaged`) | Aug 15 01:13 | **no** — 4 KB stub | yes |

The stub is deliberate: `packaged-daemon-drive.mjs` writes a fake `bin/hindsight-api` shell script when the real bundle is absent, so the packager will succeed. That is fine for isolating the spawn fix, but it means the app that proved it can spawn its daemon cannot do memory, and the app that was measured at 3.1 GB with full memory cannot start its daemon. The merged configuration on main looks correct, and I confirmed both halves work independently — but the composed artefact has never been built or launched. M7 runs on that artefact.

### G4 — A committed script copies Claude credentials, which the plan forbids (must fix)

`packages/app/scripts/m3-real-surface.mjs` lines 21–26 read `~/.claude/.credentials.json` and copy it into the test home. The plan forbids exactly this in §2.6 ("Do not copy `~/.claude/.credentials.json` or a Chrome profile unless asked"), `e2e/computer-use/harness-login.md` lists it as a forbidden action, and it is a standing user preference in `AGENTS.md`. The same file also hardcodes an absolute worktree path (`/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m3`), so it cannot run anywhere else. It is on main.

### G5 — M5 and M6 real-surface drives are thinner than the plan's verify lists (engineering)

The drives are genuine — `m5-real-surface.mjs` and `m6-real-surface.mjs` both spawn a real daemon and launch real Electron, with no fake backend — and I confirmed that by reading them. But M5's verify list in the plan asks for eight things, and the script covers four. Not driven on the real surface: the agent-initiated navigate to a new host producing the `needs-site` banner and the allow-site click; a second agent-opened browser tab coming to the front; the window-closed case where an agent navigates an already-allowed host and the window must *stay hidden*; an agent shell command producing a visible Terminal tab without stealing focus, then `terminal_read` seeing the output; tab close cleanup. Several of these exist against the *fake* daemon in `browser.spec.ts`, which is not the same claim.

Both drives also run the daemon with `skipHindsightSpawn: true`, so memory is off in every real-surface run.

### G6 — M3's "real turn that asks" was satisfied with Codex, not Claude (accepted substitution, worth stating)

M3's verify line asks for the Playwright file **and a real Claude Code turn that asks**. What exists is a real *Codex* ask (`askSeen: true`, `askPartId: call_QoFcKBovw8qF9ToNbUg80ja7` in the Codex live write-up). Given the Claude account gate below, substituting Codex is the sensible call — but the Claude `AskUserQuestion` path through the Agent SDK's `canUseTool` has never run live. There is also no `saved-results` record for M3 at all; its evidence lives only in the orchestrate checkpoint.

### G7 — Smaller items

- `saved-results/openbot-app-size-YYYY-MM-DD.md` is the filename the plan names; the record is at `openbot-m2b-package-size-2026-08-14.md`. Content is complete (3.1 GB app, 944 MB dmg, 963 MB zip, layout checks, no cap). Naming only.
- `playwright.config.ts` excludes `files-real-surface.spec.ts` from the `ci` project; no such file exists. Dead config.
- The entitlements file the plan specifies is never applied: with `mac.identity: null`, electron-builder skips signing, so the bundle is linker-signed ad-hoc with **no entitlements embedded** (I checked with `codesign -d --entitlements -`, which returns nothing). `hardenedRuntime: true` is likewise inert. This follows from the plan's own ad-hoc choice, so I do not count it against the implementation — but anyone expecting the Apple-Events entitlement to be present should know it is not.
- `daemon.ts` is 1,987 lines and `App.tsx` is 975 lines. The plan's named module paths all exist, so this is not a plan violation, but two god-files this size sit badly against the repo's own preference for small, deeply-nested modules and they are the two lowest-covered files in the tree (`daemon.ts` at 71.8%).
- Daemon coverage clears the 80% floor by 0.83 points. Any addition of uncovered code breaks CI.

---

## Human gates vs remaining engineering work

**Human / account gates — correctly deferred, not engineering failures:**

1. **`m7-human` — stranger test.** Out of coding-agent scope by the plan's own text. Needs a person and, before the session, a re-grant of Accessibility and Screen Recording for the freshly packaged ad-hoc build.
2. **`m1-smoke-max-pro` — live Claude smoke and ask-probe.** I confirmed this gate is real, not an excuse: `claude --version` works (2.1.232) and the CLI is logged in, but a one-line prompt returns *"You've hit your weekly limit · resets Aug 18 at 2pm (Asia/Dubai)"*. So M1's `smoke.mjs` requirement (must see at least one `reasoning-text` event against real Claude) and M3's real Claude ask cannot be run until that resets or the account changes.
3. **M2b step 5/8/9 — Allow-click login end-to-end on the ad-hoc packaged app.** Not done. The blocker is a macOS permission grant that only a person can click: the login diagnosis record shows Screen Recording still denied for the harness process (`login-screen-preflight.mjs` exits 2), and each ad-hoc rebuild is a new identity needing a fresh grant. This is a genuine unmet M2b acceptance criterion, and it was **not** among the gates the task named as deferred — so it should be tracked as an open M2b item, not treated as closed.

**Remaining engineering work — no human needed:**

1. Fix the agent-list race behind G1 and make the suite green ten times running; split `app.spec.ts` into per-behaviour tests.
2. Add the missing assertions listed in G2 (`/draft` send, `harness.startLogin`, queued-on-Enter, rename slug, `agent.setModel`, `needs-you` attention).
3. Build **one** packaged bundle from merged main with the real 2.3 GB Hindsight *and* `Resources/daemon/main.mjs`, launch it, and confirm both daemon spawn and a memory retain in that bundle (G3). Required before M7 is worth running.
4. Delete the credential copy and the hardcoded worktree path from `m3-real-surface.mjs` (G4).
5. Extend the M5/M6 real-surface drives to the rest of the plan's verify lists, and run at least one real-surface drive with Hindsight actually spawned rather than `skipHindsightSpawn` (G5) — my probe shows the server and the client agree, so this should now be straightforward.
6. Write the missing M3 record, or fold M3 evidence into an existing file (G6).

---

## Reproducing this judgment

```bash
git clone https://github.com/aadivyaraushan/botbox /tmp/openbot-judge
cd /tmp/openbot-judge && pnpm install --frozen-lockfile
pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage
pnpm --filter @openbot/app test && pnpm typecheck
pnpm --filter @openbot/app build
cd packages/app && npx playwright test --project=ci   # run 3+ times to see the flake

# packaged bundles: note which one has which half
ls ~/Documents/Startups/grok-bot-clone-wt-m2b/packages/app/dist/mac-arm64/OpenBot.app/Contents/Resources/daemon 2>&1
du -sh ~/Documents/Startups/grok-bot-clone-wt-gap-packaged/packages/app/dist/mac-arm64/OpenBot.app/Contents/Resources/hindsight

# bundled memory server really runs (kill it when done)
D=$(mktemp -d); mkdir -p "$D/data"
HINDSIGHT_API_LLM_PROVIDER=claude-code HINDSIGHT_DATA_DIR="$D/data" \
  ~/Documents/Startups/grok-bot-clone-wt-m2b/resources/hindsight/bin/hindsight-api --port 18992 &
curl -s http://127.0.0.1:18992/health
```

## Related files

- Earlier judgment (context only, not used as my checklist): `saved-results/openbot-m0-m6-orch-judgment-2026-08-15.md`
- Implementer checkpoint: `saved-results/openbot-orch-program-2026-08-14.md`
- Codex live write-up: `saved-results/openbot-codex-live-verify-2026-08-15.md`
- Packaging size record: `saved-results/openbot-m2b-package-size-2026-08-14.md`
- Login permission diagnosis: `saved-results/openbot-login-wallpaper-screen-recording-2026-08-14.md`
