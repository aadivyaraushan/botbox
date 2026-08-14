# OpenBot M0–M6 orchestration — independent judgment (pass 3)

**Date:** 2026-08-15
**Judge:** fresh subagent, did not implement the work. Did not read the pass-1/pass-2 judgments before forming the bar.
**Under review:** autonomous implementation of `planning/boxbot-local-plan.md`, claimed complete at `main` = `a8f1cdf` with PRs #1–#17 merged.
**Method:** built the bar from the plan (§8 build order, §9 standing tests, §11 verify-before-handoff), `AGENTS.md`, and the real-surface-verification rule *first*; then re-ran the suites myself, inspected the merged tree, opened the packaged app, and grepped for the forbidden credential copies.

## Verdict: **PASS-WITH-GAPS**

The work is real and substantially matches the plan. I re-ran every automated suite myself and they are green; the composed packaged app genuinely contains the daemon and a real ~2.5 GB Hindsight bake; no forbidden credential copying exists anywhere; CI on `main` is green. Every claim I spot-checked held up — I found no fabricated evidence.

Two genuine pieces of **engineering** work remain open, neither of which is a human gate: the repository's `README.md` still describes the abandoned remote-Linux-container product and points at the superseded plan as authoritative, and the packaged app carries **no entitlements and no bundle signature**, so the `hardenedRuntime` / entitlements block in `electron-builder.yml` is inert. Plus some documentation gaps.

---

## The bar I set before looking at the output

Derived from the plan, not from any prior gap list.

| # | A strong result must have | Source |
|---|---|---|
| 1 | `@openbot/protocol` renamed, remote-only schemas stripped, new messages present, tests green; CI no longer runs `@botbox/bot-image` | §8 M0, §9 |
| 2 | `packages/daemon` with Claude SDK, Hindsight spawn, MCP, write-deny; the ~13 named test files; ≥80% line coverage | §8 M1, §9 |
| 3 | Codex via `codex app-server --strict-config`; probes saved as fixtures; permission-profile probe; real Codex turn + resume | §8 M1b |
| 4 | M2a contract-only — **no** `Chrome.tsx` in that milestone | §8 M2a |
| 5 | Electron app; the long `app.spec.ts` assertion list; tray-notify + arch Vitest; `ci` / `local-ax` Playwright projects; real-window drive | §8 M2 |
| 6 | electron-builder ad-hoc package, `com.openbot.app`, Python + weights via `extraResources`, after-pack helper copy, size recorded, Intel gate | §8 M2b |
| 7 | M3/M4/M5/M6 specs green **and** a real-surface drive each (M6 against the real daemon, not the fake) | §8, real-surface rule |
| 8 | CI: Ubuntu `test` job (protocol+daemon coverage, app unit) + `app-e2e` on `macos-14` with `--project=ci` | §9 |
| 9 | No copying of `~/.claude/.credentials.json` or a Chrome profile | `AGENTS.md`, §2.6 |
| 10 | Human gates left honestly open, not quietly claimed closed | task framing, §8 M7 |

---

## What I verified myself

### Merged state is as claimed

`main` on the remote is `a8f1cdf`; 17 PRs merged. The three claimed SHAs map exactly:

```
0f50231 -> Ban copying Claude credentials into M3 real-surface. (#15)
015fc52 -> Prove composed OpenBot.app with real Hindsight and packaged daemon. (#16)
a8f1cdf -> Fix agent-list race before WS open and split app E2E assertions. (#17)
```

GitHub Actions on `main` is green — run `31847200270` for #17, `conclusion: success`. The last 12 `ci` runs on `main` all passed.

### Tests — re-run by me, not taken on trust

I ran these in `~/Documents/Startups/grok-bot-clone-wt-p2-e2e`, whose tree SHA (`c60df5a7202431fdac400ec1ed8f00ada4742880`) is **identical** to `a8f1cdf`, so it is byte-for-byte main's content.

| Suite | Result |
|---|---|
| `pnpm --filter @openbot/protocol test --coverage` | **56 tests, 1 file, green**; messages at 100% lines |
| `pnpm --filter @openbot/daemon test --coverage` | **22 files / 82 tests green**; **80.83%** lines (floor is 80%) |
| `pnpm --filter @openbot/app test` | **14 files / 48 tests green** |
| `pnpm --filter @openbot/app build` + Playwright | **31 passed**, 0 skipped, 0 failed (~1.0 min) |

Playwright covered every spec file — nothing silently skipped:

```
11 [ci] › e2e/app.spec.ts          6 [ci] › e2e/ask.spec.ts
 1 [ci] › e2e/browser.spec.ts      1 [ci] › e2e/files.spec.ts
 5 [ci] › e2e/gap-fold-thread-ui.spec.ts   3 [ci] › e2e/peer.spec.ts
 4 [local-ax] › e2e/login-ax.spec.ts
```

That reproduces the stability report's claim (it records 27 `ci` tests over 10 consecutive runs; I get the same 27 plus 4 `local-ax`).

### The composed bundle really does contain daemon + Hindsight

This was the claim most worth distrusting. It holds.

```
OpenBot.app                                       2.8G
  Contents/Resources/hindsight                    2.5G  (2590756 KB)
    bin/hindsight-api    (offline launcher: HF_HUB_OFFLINE=1, TRANSFORMERS_OFFLINE=1)
    python/              226M  real venv, bin/hindsight-api entry point
    hf-cache/            2.2G  real weights
  Contents/Resources/daemon/main.mjs              2.8M
  Contents/Helpers/openbot-axclick                76.7K
```

The weights are genuine models, not padding — `models--BAAI--bge-small-en-v1.5` and `models--cross-encoder--ms-marco-MiniLM-L-6-v2` blobs over 1 MB each. `CFBundleIdentifier` is `com.openbot.app`; both usage-description strings are in `Info.plist`. `scripts/dev/verify-packaged-app.sh` passes end to end (exit 0).

### No forbidden credential copying

Every `.credentials.json` reference is an **existence probe against OpenBot's own** `~/.openbot/claude-config/.credentials.json` (`daemon.ts:301,436,1307`; `hindsight-spawn.ts:78`) or a test writing its own fixture. Nothing reads or copies from `~/.claude/`. The ban is enforced in two places:

- `e2e/computer-use/harness-login.md:132` lists copying `~/.claude/.credentials.json`, `~/.codex/auth.json`, or `~/Library/Application Support/Google/Chrome` as forbidden.
- `packages/app/scripts/m3-real-surface.mjs:21` fails closed and prints `Do not copy ~/.claude/.credentials.json or a Chrome profile.`

Every `--user-data-dir` hit is Electron test isolation, not a Chrome profile copy. **Clean.**

### Plan invariants that are easy to get wrong — all correct

- **M2a was contract-only.** `f1ea647` touches only `saved-results/openbot-m2a-browser-contract-2026-08-14.md`; no `Chrome.tsx`.
- **`shell_run` registered in exactly one file** (`mcp-browser/tools.ts`). The other two hits are the Claude `toolAliases` mapping and a deny-list entry, not a second registration.
- **No `/plan` or `setPlan`** anywhere except a negative assertion in `app.spec.ts:203`.
- `thinking: { type: 'adaptive' }` present in the Claude adapter; `composer-primary` single button; `Resume to send` hint wired; `harness.completeLogin` kept per M0.
- **Every pin matches the plan:** `node-pty` 1.1.0, `@xterm/xterm` 5.5.0, `@xterm/addon-fit` 0.10.0, `@electron/rebuild` 4.2.0, `electron-builder` 26.15.7, `electron` 36.5.0, `postinstall: electron-rebuild -f -w node-pty`, `codexCli: 0.147.0` recorded.
- **No `TODO` / `FIXME` / stub / placeholder markers** in any TypeScript file.
- CI matches §9: Ubuntu job runs protocol+daemon coverage and app unit tests; `app-e2e` runs on `macos-14` with `--project=ci`; the `@botbox/bot-image` step is gone.

### Real-surface verification is genuine, not asserted

The M2 screenshot (`openbot-m2-real-window-2026-08-14.png`) shows the actual window matching §2.2/§6: Team sidebar with **New agent**, a row reading `DriveAda idle` (name + status word, not "talking to…"), a **Context compacted** divider, the `+` menu listing Terminal/Browser/Files with a *Coming in a later build* tooltip, and the composer holding the model picker (`Sonnet 5`), context donut, spend chip (`$0.12`) and one primary button, with the harness switcher above it.

The live Codex verification is real and specific — `codex-live-verify.mjs` returned `ok: true` with a genuine ask card firing through app-server (`askPartId: "call_QoFcKBovw8qF9ToNbUg80ja7"`), plus recorded M5 and M6 real-daemon drives (`m5-real-surface.mjs` all seven checks true; `m6-real-surface.mjs` `{"ok":true,...,"tabs":2,"browserProfile":0}`). M6's report explicitly notes the drive ran against a real spawned `Daemon`, not the fake.

---

## Gaps — remaining **engineering** work

### G1. `README.md` on `main` still sells the abandoned product (medium)

The repo's front door is untouched from before the pivot:

> `# Botbox` — "Open-source, self-hostable persistent AI agents. Each bot lives in its own desktop container on a Linux server, acts via terminal and Chrome, and sends traffic out through the user's home IP."
> "…Follow it as written: `planning/botbox-plan.md` — the plan (authoritative)"

Three things are wrong at once: the product name (renamed to OpenBot on 2026-08-14), the architecture (§3 lists remote VPS / Docker desktops / Tailscale as explicitly **not** being built), and the pointer to `planning/botbox-plan.md`, which the plan's own header marks **Supersedes** and `AGENTS.md` records as superseded by `planning/boxbot-local-plan.md`. This is not a human gate — it is a one-file edit that nobody did, and it is the first thing a newcomer or an M7 stranger reads.

### G2. The packaged app has no entitlements and no bundle signature (medium)

`electron-builder.yml` declares `hardenedRuntime: true` and `entitlements: build/entitlements.mac.plist`, but neither is in effect on the built app:

```
$ codesign -dv OpenBot.app
Identifier=Electron                     <- not com.openbot.app
flags=0x20002(adhoc,linker-signed)      <- Electron's own linker signature
Signature=adhoc
Sealed Resources=none
Info.plist=not bound

$ codesign -d --entitlements :- OpenBot.app
(no entitlements returned)

$ codesign --verify --deep --strict OpenBot.app
code has no resources but signature indicates they must be present
```

So the bundle was never re-signed; it carries the stock Electron linker signature. The four entitlements in `build/entitlements.mac.plist` (`allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`, `automation.apple-events`) are absent from the shipped binary.

The cause is that `mac.identity: null` makes electron-builder skip macOS code signing entirely, which silently voids the `hardenedRuntime` and `entitlements` keys sitting next to it. The plan's own §M2b yml body is internally inconsistent this way, so the implementer followed the plan verbatim — but the plan's standing rule is to **stop and revise** an underspecified step rather than ship past it, and this was never recorded anywhere.

**Honest caveat (inference, not verified):** the practical impact is probably small. Because hardened runtime is also *not* applied, library validation is not enforced either, so the bundled Python likely still loads; and the `automation.apple-events` entitlement is only required *under* hardened runtime, while the `NSAppleEventsUsageDescription` / `NSScreenCaptureUsageDescription` strings are correctly present in `Info.plist`. I could not test this because the Allow-click gate is deferred. The point stands that the shipped configuration is not the configuration the plan describes, and the discrepancy is undocumented — which matters precisely because the deferred gate is the thing that would surface it.

Related and minor: `verify-packaged-app.sh:52` asserts "no App Sandbox" by grepping the embedded entitlements. With zero embedded entitlements that check can never fail, so it gives false assurance. Its conclusion happens to be right.

### G3. A claimed artifact is not in the repository (low)

`saved-results/openbot-orch-program-2026-08-14.md` is listed as delivered output, but it is **not** committed to `main` (`git ls-tree a8f1cdf saved-results/ | grep orch-program` → 0 hits). It exists only as a 13.3 KB untracked file in the stale main worktree, as do both prior judgment files. The content exists on disk, so nothing is lost, but the program record is absent from the repo history that the PRs otherwise document well.

### G4. No M3 milestone record (low)

Every other milestone has a saved-results report — M1, M1b (three), M2, M2a, M2b, M4, M5, M6 — but there is **no** `openbot-m3-*` file, and no saved-results file mentions M3. M3's plan verification is "that Playwright file **and** a real Claude Code turn that asks." The Playwright half is green (6 `ask.spec.ts` tests), and a real ask card was proven live through *Codex* instead. That is a reasonable substitution given the Claude gate — but the substitution and the open Claude half are recorded nowhere, so M3 is the one milestone whose status a reader cannot reconstruct.

### G5. Thin coverage margin (low)

Daemon lines are **80.83%** against an 80% floor — 0.83 points of headroom. The weak spot is `src/daemon.ts` at **71.79%** lines and 64.69% branches; it is the largest file and is carried over the line by better-covered siblings. Any modest addition to `daemon.ts` will break CI.

### G6. The main working tree is stale (low, handoff hazard)

`~/Documents/Startups/grok-bot-clone` is still on `f624a0f` — two commits, pre-project — with essentially all of the delivered work sitting beside it as **untracked files**, and 17 worktrees fanned out as siblings. Merged state on the remote is correct, so this is not a defect in the deliverable, but anyone opening the project folder sees the pre-pivot repo and untracked duplicates of committed files.

### G7. Deviations from plan text worth naming (low, both defensible)

- CI `app-e2e` runs `pnpm --filter @openbot/app exec playwright test --project=ci`; the plan specifies `pnpm --filter @openbot/app test:e2e -- --project=ci`. Functionally the same, and green on `macos-14`. An extra "Ensure Electron binary" step and `pnpm typecheck` were added — both sensible.
- `electron-builder.yml` adds a second `extraResources` entry (`../../resources/daemon` → `daemon`) that is *not* in the plan's "complete body". This is what makes the packaged app able to spawn a live daemon (PRs #12/#16) — a real gap in the plan's own body, closed correctly.

---

## Human gates — correctly left open, not counted against the work

I checked each of these is genuinely tracked as open rather than quietly claimed closed.

| Gate | State | Evidence |
|---|---|---|
| **M7 stranger test** | Open | No `saved-results/openbot-stranger-test-*.md` exists. Correct. |
| **`m1-smoke-max-pro`** (Claude Max/Pro) | Open, honestly recorded | `openbot-m1-daemon-2026-08-14.md:12`: live `smoke.mjs` / login blocked by the vendor page *"Claude Max or Pro is required to connect to Claude Code"*. `smoke.mjs` and `ask-probe.mjs` therefore never ran live, so the M1 requirement of seeing ≥1 `reasoning-text` from real `claude` is unproven. `codex-live-verify` doc line 12 restates the deferral rather than papering over it. |
| **M2b packaged Allow-click** (Screen Recording re-grant) | Open, explicitly | `openbot-app-size-2026-08-15.md:21`: "Open (not claimed closed): Allow-click login still needs human Screen Recording re-grant after each ad-hoc rebuild (M2b)." |
| **v1 not Codex-only** | Respected | Claude remains a first-class harness in code (adapter, models catalog, `toolAliases`, write-deny). Only its *live* verification is blocked by the account-tier gate — nothing was deleted or downgraded to route around it. |

One consequence worth stating plainly: **Codex is proven live end to end; Claude is not proven live at all.** That is legitimately the account-tier gate's fault and not engineering debt, but it means half the harness matrix has no live evidence behind it, and G2 sits in the same blind spot.

---

## Why not PASS, and why not FAIL

**Not FAIL.** I actively looked for inflated claims and found none. Every SHA, every test count, the bundle contents, the size figures, and the credential ban all check out under independent re-running. The deferred gates are named as open in the artifacts themselves.

**Not PASS.** G1 and G2 are engineering work the plan calls for that is still undone, and both are invisible from the test suite: the README contradicts the product the plan describes, and the packaged app's signing/entitlements configuration is not the one `electron-builder.yml` claims. G2 in particular sits directly underneath the one deferred gate that would have caught it, so "deferred" is doing more work here than it should.

## To reproduce this judgment

```bash
# main's content, without touching the stale main worktree
cd ~/Documents/Startups/grok-bot-clone-wt-p2-e2e
git rev-parse HEAD^{tree}   # c60df5a7... == a8f1cdf^{tree}

pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage
pnpm --filter @openbot/app test
pnpm --filter @openbot/app build && pnpm --filter @openbot/app test:e2e

# composed bundle
APP=~/Documents/Startups/grok-bot-clone-wt-p2-compose/packages/app/dist/mac-arm64/OpenBot.app
bash scripts/dev/verify-packaged-app.sh "$APP"
codesign -dv "$APP"; codesign -d --entitlements :- "$APP"
du -sh "$APP/Contents/Resources/hindsight" "$APP/Contents/Resources/daemon"

# forbidden copies
rg -n 'credentials\.json|Google/Chrome' --glob '!node_modules' .

# merged state
gh pr list --repo aadivyaraushan/botbox --state all --limit 30
gh run list --repo aadivyaraushan/botbox --branch main --limit 5
git show a8f1cdf:README.md
```
