# OpenBot M0–M6 orchestration judgment — pass 5

**Date:** 2026-08-16
**Judge:** independent (did not implement; did not reuse the implementer's conclusions)
**Subject:** autonomous implementation of `planning/boxbot-local-plan.md` for OpenBot
**Reviewed commit:** `93814ad00f8edd315f88a318b95e473715fd26c1` on `origin/main`
**Clone used:** fresh `git clone https://github.com/aadivyaraushan/botbox.git` → `/tmp/openbot-judge-0816/repo` (the working tree at `/Users/aadivyar/Documents/Startups/grok-bot-clone` was **not** used as the product tree)

## Verdict

**PASS-WITH-GAPS.**

The M0–M6 engineering work is substantively complete, matches the plan's locked mechanisms, and is honestly recorded — including where it is not done. Everything I could check quietly is green. Three gaps remain that are engineering/documentation work rather than human gates, and one legitimately human gate leaves the entire Claude harness path unproven against the real vendor.

Nothing I found is a fabricated claim. Where evidence was thin, the records said so rather than overstating (one exception, gap 3 below).

---

## The bar I judged against

Before looking at the output I worked out from the plan (§3.5 mechanisms, §8 build order, §9 standing tests), `AGENTS.md`, and the real-surface-verification rule what a strong result would need:

1. **All M0–M6 slices implemented**, tests-first, suites green, CI green on the claimed commit.
2. **Every locked mechanism honored, nothing invented in its place**: localhost daemon transport; Hindsight as live memory with the data root inside `hindsight/data`; write-deny on both harnesses; capability-first visible shell; Codex ask via the path the probe proved; thin `Chrome.tsx` in M5 only; `appId com.openbot.app`; ad-hoc signing with `identity: "-"`; no Plan mode.
3. **Real-surface verification for each UI milestone** — driving the actual app against a real daemon, not fixtures alone.
4. **Live proof for the risky externals**: Hindsight retain/recall against a real language-model provider; a real Codex turn plus ask plus resume; agent-driven browser and terminal; peer markers with two live agents.
5. **Human gates separated from engineering work** and never claimed closed.
6. **The plan kept as the standard** — revised where reality differed, never softened to fit the code that got written.

Point 6 is the check a judge is uniquely placed to make, so I diffed every edit to the plan file. Details below.

---

## What I verified myself

### Commit and CI (checked first, as instructed)

| Check | Result |
|---|---|
| `git rev-parse HEAD` on fresh clone | `93814ad00f8edd315f88a318b95e473715fd26c1` — matches the claim |
| Commits #22–#26 present in order | `e35bcc0`, `8d5614d`, `0070880`, `843cd03`, `93814ad` — all in `git log` |
| CI check-runs on `93814ad` | `test` completed **success**; `app-e2e` completed **success** |
| `.github/workflows/ci.yml` vs plan §9 | Matches: ubuntu `test` job runs `pnpm typecheck`, `pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage`, and `pnpm --filter @openbot/app test`; second job `app-e2e` on `macos-14` runs Playwright `--project=ci` |

### Quiet suites I ran in the fresh clone

| Suite | Result |
|---|---|
| `pnpm typecheck` | Green — protocol, daemon, app |
| `pnpm --filter @openbot/protocol test` | **56 passed** (1 file) |
| `pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage` | **86 passed** (22 files); coverage lines **80.89%** — above the 80% floor |
| `pnpm --filter @openbot/app test` | **48 passed** (14 files) |

### The two claims I was told to distrust

**Hindsight data root and retain/recall — holds up.**

`packages/daemon/src/memory/hindsight-spawn.ts` remaps the child's `HOME` to `<home>/hindsight/data` (line 91), sets `HINDSIGHT_API_DATABASE_URL=pg0://hindsight` (line 100), and seeds `HOME/.pg0/installation` from the bundle's read-only `pg0-installation/` rather than downloading it (`seedPg0Installation`, lines 47–56). Because `HOME` points inside the tree, pg0's own `~/.pg0` lands under `hindsight/data` — it cannot escape to a real `~/.pg0`. Offline flags `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` and a bundled `HF_HOME` are set. Missing binaries return `{ ok: false, reason: 'missing' }` after logging `[memory] hindsight-pg-missing` — visible, not a silent online fetch.

The live record (`saved-results/openbot-hindsight-live-verify-2026-08-15.md`) reports `data_dir` at `…/hindsight/data/.pg0/instances/hindsight/data`, retain plus snapshot OK with `MEMORY.md` at 111 bytes, and recall returning 1 result — with the language model coming from the real Codex login under `~/.openbot/codex-home`. That is a genuine round trip, not a fake client. Caveat I want to be precise about: the run used a temporary `OPENBOT_HOME`, not literally `~/.openbot`. That exercises the same code path, so I accept it, but it is a temp-dir run rather than the real data root.

The related deny rule also landed: `os.homedir()/.pg0` is denied in `packages/daemon/src/claude/write-deny.ts` (line 82) and in the Codex permission profile (`packages/daemon/src/codex/config.ts`, line 49).

**Codex shell default — holds up.**

`packages/daemon/src/codex/config.ts` line 31 emits `shell_tool = false` **only** when `shellToolFalse === true`, so the default config keeps Codex's built-in `command_execution`. No production caller passes `true`. On the Claude side, `buildClaudeShellOptions` skips the alias and keeps `Bash` when the SDK lacks `toolAliases` (`packages/daemon/src/claude/adapter.ts`, lines 57–64). Capability-first is honored in the direction the plan requires: a real harness capability was not disabled to serve our UI. The plan explicitly lists this fallback as *not* stop-and-revise, so it does not fail M5.

### Structure, mechanisms, and hygiene

- **M0 strip is real, not cosmetic.** Grepping `packages/*/src`, `packages/*/test`, and `.github` for `setExitNode`, `tailnetDns`, `exitNodeEnabled`, `roleMd`, `setPlan`, `botId`, `@botbox`, `peer-rate-limit`, `waiting-intervention` returns matches **only** inside the protocol test's rejection assertions. No live use anywhere.
- **Every daemon test file the plan names exists**: memory, hindsight-spawn, models, turns, write-deny, peer, ws, mcp, login, team, resume, skills, ask, codex, harness-switch, browser-gate, terminal, files, shell-mcp.
- **Every app e2e spec the plan names exists**, plus the `ci` / `local-ax` Playwright split so `login-ax.spec.ts` stays off CI.
- **`packages/app/electron-builder.yml` matches the plan's pinned body**, including `identity: "-"`, `hardenedRuntime: true`, entitlements, both `extraResources` entries, and `afterPack`.
- **`scripts/dev/verify-packaged-app.sh` fails closed on the exact defect it was written for**: it requires `codesign -dv` `Identifier=com.openbot.app` (not just `CFBundleIdentifier`), non-empty embedded entitlements, absence of `app-sandbox`, and a Hindsight tree over 100MB so a stub cannot pass.
- **No skipped or `todo` tests; no `TODO` / `FIXME` / "not implemented" / stub markers anywhere in `packages/*/src`.**

### The plan was not softened to fit the code

Six commits touched `planning/boxbot-local-plan.md` after it was first committed, totalling about 21 added and 11 removed lines. I read every one:

| Commit | Change | Direction |
|---|---|---|
| `33648cf` | Adds the Screen-Recording preflight pin before any login click | Tightens |
| `22c5c49` | Rewrites the Codex argv bullets | **Drifts — see gap 1** |
| `6ccf5f1` | Adds the packaged-daemon spawn lock | Adds |
| `015fc52` | Adds the composed-package proof step | Tightens |
| `f5e525d` | `identity: null` → `identity: "-"` plus the signing lock | Tightens (corrects a real defect) |
| `e35bcc0` | Rewrites Hindsight first-use: `pg0-installation`, `HOME` remap, deny `~/.pg0`, shared `CODEX_HOME` instead of an empty `hindsight/codex` | Tightens |

No acceptance criterion was lowered to match what got built. The `identity: null` → `"-"` correction is the clearest sign of good faith: the implementer found that the earlier packages had shipped a stock Electron linker signature with no entitlements, wrote that discrepancy into the plan as a known defect, and fixed the config rather than quietly redefining "ad-hoc signed."

---

## Gaps (engineering / documentation, not human gates)

### 1. The plan's Codex argv section now contradicts the shipped code — medium

Commit `22c5c49` replaced the plan's app-server bullet with:

- First turn: `codex exec "<msg>" --json --strict-config …`
- Resume: `codex exec resume <threadId> "<msg>" …`

But the adapter runs main turns and resumes through **`codex app-server`** JSON-RPC: `buildAppServerArgv` produces `['app-server', '--listen', 'stdio://', '--strict-config']` (`packages/daemon/src/codex/exec-argv.ts`, lines 28–32), and `packages/daemon/src/codex/adapter.ts` sends `initialize`, then `thread/resume` or `thread/start`, then `turn/start` (lines 320–350).

The code is right and the plan text is stale. `saved-results/openbot-m1b-codex-probe-revise-2026-08-14.md` records the reason: probe 2 proved `codex exec` **cannot** ask, probe 2b proved app-server can, so "Main Codex turns + ask use `codex app-server` JSON-RPC." Section §3.5 of the plan still describes the app-server ask path, so the plan now disagrees with itself.

Why it matters: the plan is the handoff standard. A fresh implementer following §8 M1b would build Codex main turns on `exec` and would silently lose ask cards — a locked requirement. Also, `codex.test.ts` is described in the plan as asserting `--strict-config` "on main, resume, and compact," where main is now an app-server spawn, so the wording no longer describes what is being asserted. No runtime impact today.

### 2. No single build is both ad-hoc signed and live-driven — low-medium

The two packaging proofs are on different builds:

- **Composed live drive** (real ~2.5G Hindsight, packaged daemon `main.mjs`, daemon actually spawns, `agent.list` ok) ran on the `p2-compose` build — which was packaged with `identity: null`, i.e. unsigned.
- **Ad-hoc signing proof** (`Identifier=com.openbot.app`, `flags=0x10002(adhoc,runtime)`, non-empty entitlements, no App Sandbox) ran on the `p3-signing` build, verified only by `verify-packaged-app.sh`.

`verify-packaged-app.sh` checks static structure and the signature; it never spawns the daemon. Grepping `saved-results/` for the composed drive returns only `openbot-app-size-2026-08-15.md`, which points at the `p2-compose` build. So "ad-hoc signed + hardened runtime + live packaged daemon" is an untested combination — and it is the combination M7 will actually run on.

Technical risk is low. I checked the Electron docs rather than guessing: `ELECTRON_RUN_AS_NODE` is ignored only when the `runAsNode` fuse is disabled, and no hardened-runtime filtering of it is documented (https://www.electronjs.org/docs/latest/api/environment-variables). electron-builder does not disable fuses by default. So the daemon spawn should survive signing — but "should" is doing work here that one run of `composed-packaged-drive.mjs` against the signed build would remove.

### 3. The Codex shell record's "live verify" label overstates what ran — low

`saved-results/openbot-codex-shell-live-verify-2026-08-15.md` reports `restoredBuiltinOk: true`. In the script, `restoredBuiltinOk = !shellToolFalse` (`packages/daemon/scripts/codex-shell-live-verify.mjs`, line 222) — it is a statement about the generated config, not about a command running. The same JSON records `builtinBashSeen: false`, `terminalRunSeen: false`, `turnFinished: false`.

What was genuinely proven live is the negative: with `shell_tool = false`, a real Codex turn never emitted MCP `shell_run` or `terminal.run` after ~180s. The fallback's shell execution was never observed end to end. The plan permits the fallback without live proof, so this does not fail M5 — but a reader would take "live verify" plus `restoredBuiltinOk: true` to mean more than happened.

### 4. Coverage margin is thin — minor

Lines are at 80.89% against an 80% floor, with `daemon.ts` — the largest file — at 71.79%. It passes, with little room before a refactor trips it.

---

## Human gates (correctly open, correctly not claimed closed)

1. **`m7-human` — stranger test.** Not run. Must run on the M2b ad-hoc build, with Accessibility and Screen Recording re-granted first.
2. **`m1-smoke-max-pro` — Claude Code account login.** Blocked at the vendor with "Claude Max or Pro is required to connect to Claude Code" (`openbot-m1-daemon-2026-08-14.md`). The consequence deserves stating plainly, because it is the largest residual risk in the whole program: **no live Claude turn has ever run.** M1's smoke step (which must observe at least one `reasoning-text` event from the real `claude` binary) and M3's "real Claude Code turn that asks" are both unexecuted. Since v1 was not declared Codex-only, one of the two shipping harnesses is unproven against the real vendor — every Claude claim rests on unit tests and fixtures. This is genuinely an account gate, not deferred engineering, and the records refuse to invent evidence for it. The credential-copy ban is honored: nothing copies `~/.claude/.credentials.json` or a Chrome profile, and the ban is written into the M3 record.
3. **M2b Allow-click E2E.** Still open, and every packaging record says so explicitly rather than folding it into a pass. Requires a human to re-grant Accessibility and Screen Recording after each ad-hoc rebuild.
4. **Developer-ID signing and notarization.** Documented as a follow-on after M2b, not a blocker — consistent with the plan.

---

## What I deliberately did not check, and why

Per the quiet-judgment instruction, I did not take the display. Specifically skipped:

- **Playwright and Electron window drives.** `electron.launch` opens a real window. I skipped the whole layer rather than grab the GUI. Substitute evidence: the `app-e2e` job on `macos-14` is green at the reviewed commit, and `openbot-p2-e2e-stability-2026-08-15.md` records the `ci` project green 27/27 across 10 consecutive runs.
- **Launching the packaged `OpenBot.app`**, any Chrome or login helper, any Allow-click, any `screencapture`.
- **Re-running the live evidence** (Hindsight retain/recall, M4 two-agent peer, M5 agent-drive, M6 files drive, packaging). These need real vendor logins, a 2.5GB Hindsight bake that is correctly gitignored, local worktrees, and the GUI. I judged them by reading the code paths they exercise and checking each record for internal consistency and for claims that exceed what the script computes — which is how I found gap 3. I did not reproduce them, and I am not asserting they would reproduce.

---

## What would close this out

1. Fix the plan's §8 M1b Codex argv bullets to describe `codex app-server` for main and resume, keeping `codex exec` for the compact one-shot and the resume verify, so §8 and §3.5 agree and match the code.
2. Run `node packages/app/scripts/composed-packaged-drive.mjs` once against the **ad-hoc signed** build and record it, so one build carries both proofs.
3. Retitle or re-scope the Codex shell record so `restoredBuiltinOk` reads as the config assertion it is; optionally observe one built-in `command_execution` turn end to end.
4. Human gates, in order: M2b Allow-click after re-grant → `m1-smoke-max-pro` once a Claude Max/Pro account exists → M7 stranger test on the ad-hoc build.

## How to reproduce this judgment

```bash
mkdir -p /tmp/openbot-judge-0816 && cd /tmp/openbot-judge-0816
git clone https://github.com/aadivyaraushan/botbox.git repo && cd repo
git rev-parse HEAD   # expect 93814ad00f8edd315f88a318b95e473715fd26c1
gh api repos/aadivyaraushan/botbox/commits/93814ad00f8edd315f88a318b95e473715fd26c1/check-runs \
  --jq '.check_runs[] | "\(.name)\t\(.conclusion)"'   # expect test/success, app-e2e/success

pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage
pnpm --filter @openbot/app test

# gap 1
sed -n '413,419p' planning/boxbot-local-plan.md            # plan says codex exec
sed -n '28,32p'   packages/daemon/src/codex/exec-argv.ts   # code builds app-server
sed -n '320,350p' packages/daemon/src/codex/adapter.ts     # thread/start + turn/start

# gap 2
grep -rln "composed-packaged-drive" saved-results/         # only the app-size file (identity:null build)

# gap 3
sed -n '214,225p' packages/daemon/scripts/codex-shell-live-verify.mjs   # restoredBuiltinOk = !shellToolFalse

# plan not weakened
git log --oneline -- planning/boxbot-local-plan.md
```
