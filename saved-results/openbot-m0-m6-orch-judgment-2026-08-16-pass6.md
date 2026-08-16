# OpenBot M0–M6 orchestration judgment — pass 6

**Date:** 2026-08-16
**Judge:** independent (did not implement; did not reuse the implementer's conclusions; did not start from prior FAIL/gap lists)
**Subject:** autonomous implementation of `planning/boxbot-local-plan.md` for OpenBot
**Reviewed commit:** `ab405d79f090a74ba7af37af6e3eb26c2e5e6539` on `origin/main`
**Clone used:** fresh `git clone https://github.com/aadivyaraushan/botbox.git` → `/tmp/judge-pass6/botbox`. The working tree at `/Users/aadivyar/Documents/Startups/grok-bot-clone` was **not** used as the product tree.

## Verdict

**PASS-WITH-GAPS.**

The M0–M6 engineering work is complete against the plan, the suites and typechecks are green in a fresh clone, and the records are honest about what is not done. The three engineering gaps raised in pass 5 are genuinely closed, and I verified two of them directly against the artifacts rather than taking the records' word for it.

What remains is one piece of **off-path evidence** (the live shell proof does not run through the code path the product actually ships), one **residual plan/code contradiction** in the same paragraph pass 5 flagged, and the human gates — which are correctly open and correctly not claimed closed.

Nothing I found is fabricated. One record's headline claim is stronger than what its script actually exercised; details in gap 1.

---

## The bar I set before looking at the output

Worked out from the plan (§2 copy-these, §3.5 mechanisms, §8 build order, §9 standing tests), `AGENTS.md`, the leftover-call artifacts, and the real-surface-verification rule. A strong result needs:

1. **All M0–M6 slices implemented**, tests written first, every test file the plan names present, suites green, coverage at or above the 80% line floor, CI green on the reviewed tip.
2. **Every locked mechanism honored, nothing invented in its place**: loopback-only daemon transport with in-memory per-agent MCP tokens; Hindsight as live memory with the writable data root at `hindsight/data` and no `pg0` instance-data copy; write-deny on both harnesses; capability-first visible shell; Codex ask through the path the probe proved; thin `Chrome.tsx` in M5 only; `appId com.openbot.app`; ad-hoc signing via `identity: "-"`; no Plan mode.
3. **Real-surface verification for each milestone with a screen** — the actual app, not fixtures alone.
4. **Live proof for the risky externals** the plan cannot assume: Hindsight retain/recall against a real language model; a real Codex turn plus ask plus resume; agent-driven browser and terminal; peer markers with two live agents.
5. **Evidence that matches the shipped path.** A proof that exercises a different code path, or a config assertion standing in for an observed behavior, does not count. This is the check I weighted most heavily, because it is the one a judge is uniquely placed to make.
6. **Human gates separated from engineering work** and never folded into a pass.
7. **The plan kept as the standard** — revised where reality differed, never softened to match whatever got written.

---

## Fail-fast checks

| # | Check | Result |
|---|---|---|
| 1 | `origin/main` SHA matches the claim | **Pass.** `git rev-parse origin/main` = `ab405d79f090a74ba7af37af6e3eb26c2e5e6539` |
| 1 | PRs 27–30 merged, merge commits on main | **Pass.** All four `MERGED` into `main`; merge commits `809d88f`, `c363284`, `c6f2a01`, `ab405d7` all appear in `git log` in that order |
| 2 | §8 matches the adapter on `app-server` vs `exec` | **Pass.** Both directions verified — see below |
| 3 | Shell evidence is an observed command, not a config flag | **Pass on the letter, gap on the substance.** A real command with stdout was observed, but not on the shipped path — see gap 1 |
| 4 | Signed and live-driven are the same artifact | **Pass, independently verified** — see below |

### Check 2 — §8 vs the adapter

The plan now says the same thing in both places, and the code agrees:

- §8 M1b (line 1538): "Main/ask/resume argv is `buildAppServerArgv` (`app-server --listen stdio:// --strict-config` …); model goes in JSON-RPC `thread/start` / `thread/resume` / `turn/start`, not `--model` on app-server argv."
- §3.5 Codex argv (line 413): "**Main turns, ask cards, and resume** use **`codex app-server`** … **not** `codex exec --json`" plus "**Compact only** stays on `codex exec`."
- Code: `packages/daemon/src/codex/exec-argv.ts:28–32` builds exactly `['app-server', '--listen', 'stdio://', '--strict-config']`; `adapter.ts:78` calls `buildAppServerArgv`; `adapter.ts:326/336/346` send `thread/resume`, `thread/start`, `turn/start`; `adapter.ts:144` handles `item/tool/requestUserInput`. The only `exec` caller in `src/` is `harness/compact.ts:25` — compact, as the plan says.

PR 27's plan edit **tightened** rather than softened: it also rewrote the M1b verify step from "then `codex exec resume <thread_id>`" to resume via app-server JSON-RPC "**not** `codex exec resume`", and added "Do **not** change the working adapter back to exec for main/ask/resume."

Minor leftover: `CodexExecKind` still includes a `'main-exec'` variant and `buildCodexArgv('resume', …)` still builds an `exec resume` argv. Neither is called from `src/` (only `codex.test.ts:502`). Dead code that contradicts the lock it sits next to; harmless today.

### Check 4 — signed and live are one artifact

I inspected the existing build directly (read-only, no rebuild):

`/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-signed/packages/app/dist/mac-arm64/OpenBot.app`

```text
Identifier=com.openbot.app
CodeDirectory v=20500 size=752 flags=0x10002(adhoc,runtime)
Signature=adhoc
TeamIdentifier=not set
Sealed Resources version=2 rules=13 files=71699
…: valid on disk
…: satisfies its Designated Requirement
```

Embedded entitlements are non-empty and are exactly the plan's four keys (`automation.apple-events`, `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`); no `app-sandbox`. `Info.plist` `CFBundleIdentifier` is also `com.openbot.app`, so this is not the old linker-signed `Identifier=Electron` defect.

The same bundle is composed, not a stub:

| Path | Observed |
|---|---|
| `Contents/Resources/hindsight` | **2.5G**, real subtree (`bin/`, `python/`, `hf-cache/`, `pg0-installation/`), no symlinks inside the bundle |
| `Contents/Resources/hindsight/bin/hindsight-api` | present |
| `Contents/Resources/daemon/main.mjs` | present, 2.8M |
| `Contents/Helpers/openbot-axclick` | present, 95.3K |
| whole app | **3.1G** |

For the live half I did not re-run the drive (it launches a real window; excluded by the quiet instruction). Instead I used a corroboration the implementer could not have faked without also faking my own measurements: `composed-packaged-drive.mjs` calls `writeSizeNote` **only after** `agent.list` returns ok (script lines 239–245, inside the try block). `saved-results/openbot-app-size-2026-08-15.md` names this exact app path and records `3324661760` bytes for the app and `2689007616` for the hindsight tree — matching the 3.1G / 2.5G I measured myself. So the machine-written proof that the drive reached PASS is tied to the same artifact I just verified the signature on. Check 4 holds.

The script also genuinely fails closed: `assertRealHindsight` requires `bin/hindsight-api`, `python`, and `hf-cache` to exist and the tree to exceed 100MB, and it never writes a stub.

---

## Quiet verification I ran myself (fresh clone)

| Suite / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | clean |
| `pnpm --filter @openbot/protocol test` | **56 passed** (1 file) |
| `pnpm --filter @openbot/daemon test --coverage` | **89 passed** (23 files); lines **80.89%** |
| `pnpm --filter @openbot/app test` | **48 passed** (14 files) |
| `pnpm --filter @openbot/app typecheck` | clean |
| `pnpm --filter @openbot/daemon typecheck` | clean |
| CI check-runs on `ab405d7` | `test` **success**, `app-e2e` **success** |
| CI check-runs on `c6f2a01` | `test` **success**, `app-e2e` **success** |
| `.github/workflows/ci.yml` vs §9 | Matches: ubuntu `test` runs `pnpm typecheck`, protocol+daemon `test --coverage`, and `@openbot/app test`; second job `app-e2e` on `macos-14` runs Playwright `--project=ci` |

Every daemon test file the plan names exists (memory, hindsight-spawn, models, turns, write-deny, peer, ws, mcp, login, team, resume, skills, ask, codex, harness-switch, browser-gate, terminal, files, shell-mcp) plus four more. Every app e2e spec the plan names exists (app, ask, peer, browser, files, login-ax).

### Constraint checks

- **No credential or Chrome-profile copying.** Grepping `packages/` for `.credentials.json` returns only `existsSync` provider checks against OpenBot's *own* `claude-config/.credentials.json` (`hindsight-spawn.ts:113`, `daemon.ts:301/436/1307`) and test setup writing that path. `packages/app/scripts/m3-real-surface.mjs:21` explicitly refuses and prints "Do not copy `~/.claude/.credentials.json` or a Chrome profile." No `cliclick` anywhere; `login-ax.spec.ts:46` asserts its absence.
- **Codex capability-first shell.** `config.ts:31` emits `shell_tool = false` **only** when `shellToolFalse === true`; no production caller passes it, so the built-in `command_execution` capability is kept. Claude side keeps `Bash` when the SDK lacks `toolAliases`. This is the direction the plan requires, and the plan lists this fallback as explicitly *not* stop-and-revise.
- **Hindsight data root.** `hindsight-spawn.ts:67` sets `dataRoot = join(home, 'hindsight', 'data')` and line 91 remaps the child `HOME` there, so pg0's `~/.pg0` cannot escape the tree. `seedPg0Installation` (lines 47–56) copies **binaries only** from the bundle's `pg0-installation/`, never instance data, and returns false → `[memory] hindsight-pg-missing` rather than fetching online. Offline flags and a bundled `HF_HOME` are set. `CODEX_HOME` is the shared `join(home,'codex-home')`, not the forbidden empty `hindsight/codex`.
- **No Plan mode**, no `roleMd`, no remote-only fields: the M0 strip holds — those tokens appear only inside the protocol tests' rejection assertions.

---

## Gaps

### 1. The live shell proof does not run through the shipped path — medium-low

`saved-results/openbot-codex-builtin-shell-live-2026-08-16.md` headlines "Live built-in shell observed," and it is right that a real command ran: `command_execution` for `/bin/zsh -c 'echo openbot-builtin-shell-ok'`, `aggregated_output` `openbot-builtin-shell-ok\n`, `exit_code 0`, then `turn.completed`. That is a real improvement over pass 4's config-only `restoredBuiltinOk`, and check 3 passes on the letter.

But the proof does not exercise what OpenBot ships. Reading `packages/daemon/scripts/codex-builtin-shell-live.mjs`:

- **Wrong transport.** Lines 60–72 build `['exec', prompt, '--json', …]`. Main turns ship on `codex app-server` (check 2 above). The proof is on the path the plan says not to use for main turns.
- **Forbidden flag, and the gate it replaces is absent.** The argv includes `--sandbox danger-full-access` (lines 64–65), which §3.5 line 413 forbids outright — "**Never** pass `--sandbox` … the permission profile in `config.toml` is the gate" — and which the daemon's own `assertSafeCodexArgv` (`exec-argv.ts:49`) throws on. The hand-rolled `config.toml` (lines 35–47) sets `sandbox_mode = "danger-full-access"` and contains **no** `default_permissions` / `[permissions.openbot]` block, so it is not the config `buildCodexConfigToml` produces. The run proves the shell fires with the gate switched off, not with the gate the product ships.
- **The shipped item shape is still unobserved.** Real app-server output uses camelCase item types — `live-app-server-turn-completed.json` shows `"type":"agentMessage"` — so a shell command on app-server would arrive as `commandExecution`. Searching every fixture in `packages/daemon/test/fixtures/codex/`, the string `commandExecution` appears **zero** times; both shell fixtures (`live-builtin-shell-2026-08-16.jsonl`, `probe3-write-scope.jsonl`) are snake_case exec output. So the `commandExecution` branch the adapter relies on (`adapter.ts:214`, `codexItemToolName` at `adapter.ts:13`) is written from inference, against the plan's own "probe, don't invent" rule for Codex field names.

Mitigating, and worth saying because it is stronger evidence than the artifact the implementer chose to lead with: **`probe3-write-scope` already covers the config-gate half.** `probe3-write-scope.md` records built-in `command_execution` running under the real permission profile (`default_permissions = "openbot"` with absolute filesystem keys, `--strict-config`) and correctly enforcing it — Desktop write OK, other-agent write denied, private read denied, other-agent read allowed. So the shipped *config* demonstrably does not block the shell. What no artifact shows is a shell command through the shipped *transport*.

Per the plan this does not fail M5 — "**Do not fail M5** solely because main-agent JSONL still emits `command_execution`," and the built-in fallback is explicitly not stop-and-revise. It is an evidence gap, not a product defect.

### 2. Residual plan/code contradiction, in the paragraph PR 27 edited — low-medium

Same class as pass 5's gap 1, and PR 27 touched this exact line without fixing it.

Plan §8 M1b (line 1540) describes `codex.test.ts` as asserting that the generated `config.toml` has:

> `default_permissions = "openbot"`, **`shell_tool = false`**, and permission filesystem rules

The test asserts the opposite. `packages/daemon/test/codex.test.ts:67`:

```ts
expect(toml).not.toContain('shell_tool = false')
```

and `shell-mcp.test.ts:26` names it "default Codex omits shell_tool=false (capability-first until live MCP proof)".

§3.5 is correct — lines 405, 461, and 471 all condition `shell_tool = false` on the preferred visible-shell path being available. Only §8's test-description clause is stale, left over from before PR 25 restored the built-in shell. No runtime impact, but the plan is the handoff standard: an implementer following §8 M1b would write an assertion that fails against the shipped config, and §8 now disagrees with §3.5 in the same way that PR 27 was raised to fix.

### 3. The real `~/.openbot/hindsight/data` has never been created — minor

The task constraint reads "Live Hindsight under `~/.openbot/hindsight/data`." The code resolves that path correctly from `OPENBOT_HOME` (gap-free, verified above), but the live run used a temporary home: `openbot-hindsight-live-verify-2026-08-15.md` reports `data_dir` under `/var/folders/…/T/openbot-hs-live-glUnz3/hindsight/data/.pg0/…`. On this Mac, `~/.openbot/hindsight/` contains only an empty leftover `codex/` directory — no `data/`. The temp run exercises the identical code path, so I accept it, but the literal real data root is unexercised, and the stray `hindsight/codex/` is the very directory §3.5 says not to point at (harmless leftover; current code points at `codex-home`).

### 4. The signed build's Hindsight bake is not reproducible from its own worktree — minor

`resources/hindsight` in the p5-signed worktree is a **symlink** to `…/grok-bot-clone-wt-p3-signing/resources/hindsight`. The shipped bundle is fine — electron-builder dereferenced it and the app contains 2.5G of real files with no symlinks inside. But this is why `composed-packaged-drive.mjs` needed the `realpathSync` fix before `du -sk` (line 37), and it means the build depends on a second worktree still existing. Dev-machine hygiene, not a product defect.

### 5. Coverage margin is thin — minor (carried)

Lines at **80.89%** against an 80% floor, with `daemon.ts` — the largest file — at 71.79%. Passes with little headroom.

---

## Human gates (correctly open, correctly not claimed closed)

The ledger in `openbot-orch-program-2026-08-14.md` lists all three under "Still gated (human)" at each checkpoint, and every packaging record repeats that Allow-click is not closed.

1. **`m7-human` — stranger test.** Not run. Must run on the M2b ad-hoc build after re-granting Accessibility and Screen Recording.
2. **`m1-smoke-max-pro` — Claude Code account login.** Blocked at the vendor ("Claude Max or Pro is required"). Stated plainly because it is the largest residual risk in the program: **no live Claude turn has ever run.** M1's smoke step (which must observe at least one `reasoning-text` event from the real `claude` binary) and M3's "real Claude Code turn that asks" are both unexecuted. v1 was not declared Codex-only, so one of two shipping harnesses rests entirely on unit tests and fixtures. This is an account gate, not deferred engineering, and the records refuse to invent evidence for it.
3. **M2b Allow-click E2E.** Open. `openbot-signed-composed-drive-2026-08-16.md` says so in its own verdict rather than folding it into the pass.
4. **Developer-ID signing and notarization.** Documented as a follow-on after M2b, not a blocker — matches the plan.

---

## What I deliberately did not check, and why

Per the quiet instruction I did not take the display. Skipped: Playwright and Electron window drives (`electron.launch` opens a real window); launching the packaged `OpenBot.app`; any Chrome, login helper, `screencapture`, or Allow-click; and re-running the live evidence (Hindsight retain/recall, M4 two-agent peer, M5 agent-drive, M6 files drive). Those need real vendor logins, a gitignored 2.5GB bake, local worktrees, and the GUI.

Substitute evidence used: `app-e2e` green on the reviewed tip; `openbot-p2-e2e-stability-2026-08-15.md` records the `ci` project green 27/27 across 10 consecutive runs; and for packaging, direct `codesign` inspection plus the byte-for-byte match between the script-written size note and my own measurements. I judged the live records by reading the code paths they exercise and checking each script against its own headline claim — which is how I found gap 1. I did not reproduce them and I am not asserting they would reproduce.

I did **not** start from the pass-5 gap list; I set the bar first, then found that three of my checks landed on the same paragraph pass 5 had flagged. Gap 2 is a fresh finding within it.

---

## What would close this out

1. Observe one built-in shell command through the **shipped** path: `codex app-server` with a `buildCodexConfigToml`-generated `config.toml` and **no** `--sandbox`. Save the raw `commandExecution` item as a fixture so the adapter's camelCase branch is pinned from real output instead of inference. Re-scope `openbot-codex-builtin-shell-live-2026-08-16.md` to say the observation was on the exec path with the sandbox gate off.
2. Fix §8 M1b line 1540 so the `codex.test.ts` description matches the shipped default (config **omits** `shell_tool = false` until the MCP path is proven live), aligning §8 with §3.5.
3. Delete the dead `'main-exec'` kind and the `exec resume` branch of `buildCodexArgv`, or note in the plan why they stay.
4. Run the Hindsight live verify once against the real `~/.openbot` so the shipped data root is exercised; remove the stray empty `~/.openbot/hindsight/codex/`.
5. Bake `resources/hindsight` into the build worktree itself rather than symlinking a sibling worktree.
6. Human gates, in order: M2b Allow-click after re-grant → `m1-smoke-max-pro` once a Claude Max/Pro account exists → M7 stranger test on the ad-hoc build.

---

## How to reproduce this judgment

```bash
mkdir -p /tmp/judge-pass6 && cd /tmp/judge-pass6
git clone https://github.com/aadivyaraushan/botbox.git botbox && cd botbox
git rev-parse origin/main   # expect ab405d79f090a74ba7af37af6e3eb26c2e5e6539
for n in 27 28 29 30; do gh pr view $n --json state,mergeCommit; done

gh api repos/aadivyaraushan/botbox/commits/ab405d79f090a74ba7af37af6e3eb26c2e5e6539/check-runs \
  --jq '.check_runs[] | "\(.name)\t\(.conclusion)"'   # expect test/success, app-e2e/success

pnpm install --frozen-lockfile
pnpm --filter @openbot/protocol test                 # 56 passed
pnpm --filter @openbot/daemon test --coverage        # 89 passed, lines 80.89%
pnpm --filter @openbot/app test                      # 48 passed
pnpm --filter @openbot/app typecheck && pnpm --filter @openbot/daemon typecheck

# check 2: plan and code agree on app-server
sed -n '413,417p'  planning/boxbot-local-plan.md
sed -n '28,32p'    packages/daemon/src/codex/exec-argv.ts
grep -n 'thread/start\|thread/resume\|turn/start' packages/daemon/src/codex/adapter.ts

# check 4: signed + composed, same artifact
APP=/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p5-signed/packages/app/dist/mac-arm64/OpenBot.app
codesign -dv "$APP"; codesign -d --entitlements :- "$APP"; codesign --verify --verbose=2 "$APP"
du -sh "$APP" "$APP/Contents/Resources/hindsight"    # 3.1G / 2.5G, matches the size note bytes

# gap 1: proof is exec + --sandbox, and no camelCase shell fixture exists
sed -n '60,72p' packages/daemon/scripts/codex-builtin-shell-live.mjs
grep -rc commandExecution packages/daemon/test/fixtures/codex/ ; true   # zero matches
grep -o '"type":"agentMessage"' packages/daemon/test/fixtures/codex/live-app-server-turn-completed.json

# gap 2: plan says the test asserts shell_tool = false; the test asserts the opposite
sed -n '1540p' planning/boxbot-local-plan.md | grep -o 'shell_tool = false'
grep -n 'shell_tool = false' packages/daemon/test/codex.test.ts

# gap 3: real data root absent
ls ~/.openbot/hindsight/          # only codex/, no data/
```
