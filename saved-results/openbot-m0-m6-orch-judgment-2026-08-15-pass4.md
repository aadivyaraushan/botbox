# OpenBot M0–M6 orchestration — independent judgment (pass 4)

**Date:** 2026-08-15
**Judge:** fresh subagent. Did not implement any of this work. Built the bar from `planning/boxbot-local-plan.md` (§2, §3.5, §8, §9, §11), `AGENTS.md`, the leftover-call artifacts the plan cites, and the real-surface-verification rule **before** looking at the output. Did not start from the pass-1/2/3 gap lists.
**Under review:** autonomous implementation of the local-team plan, claimed complete at `main = a80dd6b` with PRs #1–#21 merged.
**Method:** cloned `origin/main` fresh into `/tmp/openbot-judge` (so nothing came from a worktree the implementer had touched), re-ran every suite myself, inspected the packaged app with `codesign`, started the bundled Hindsight server myself and called its HTTP API, and diffed the committed plan against the local copy to check whether the bar had been quietly moved.

## Verdict: **PASS-WITH-GAPS**

The work is real, large, and faithful to the plan. Every automated suite I re-ran is green, the packaged app is genuinely ad-hoc signed as `com.openbot.app` with embedded entitlements and a real ~2.5 GB Hindsight bake, no forbidden credential copying exists, and the plan was only ever edited to make requirements **stricter**, never looser. I found no fabricated evidence: every claim I spot-checked held.

What keeps it from PASS is one theme plus some smaller holes, all **engineering** work rather than human gates: **the live memory system has never actually run.** Every test and every real-surface drive disables it (`skipHindsightSpawn: true`), so retain / recall / `MEMORY.md` exist only against fake HTTP clients. When I ran the real bundled server myself I found two deviations from locked plan text that nobody has noticed: the memory database lands in `~/.pg0`, not the locked `~/.openbot/hindsight/data`, and first use downloads PostgreSQL from GitHub, so "first use initializes offline" is not true as written.

---

## The bar I set before looking at the output

| # | A strong result must have | Source |
|---|---|---|
| 1 | `@openbot/protocol` renamed and stripped of remote-only schemas; new messages/parts; tests green; CI no longer runs `@botbox/bot-image` | §8 M0, §9 |
| 2 | `packages/daemon`: Claude Agent SDK turns, Hindsight spawn + retain/recall, MCP HTTP server, write-deny, peer delivery, resume-continue, ask; the ~13 named test files; ≥80% line coverage | §8 M1, §9 |
| 3 | Codex through `codex app-server --strict-config` (not `exec --json`); probe fixtures saved; permission profiles with absolute keys probed under `--strict-config`; real Codex turn + resume | §8 M1b, §3.5 |
| 4 | M2a contract-only — no `Chrome.tsx` in that milestone | §8 M2a |
| 5 | Electron app matching §2/§6 chrome: one composer primary (Send/Stop/Resume), model picker + donut + spend inside the composer, harness switcher above it, tray + notifications, Apple Silicon gate; the long `app.spec.ts` list; `ci` / `local-ax` Playwright projects | §8 M2 |
| 6 | M2b: electron-builder ad-hoc package, `com.openbot.app`, Python 3.11 + `hindsight-all` + baked weights via `extraResources`, after-pack helper, size recorded, Intel gate | §8 M2b |
| 7 | M3/M4/M5/M6 specs green **and** a real-surface drive each, driving the surface a user drives — not only fixtures | §8, real-surface rule |
| 8 | Memory actually working: bundled server spawns, bank creates, retain writes, recall rewrites `MEMORY.md`, data in the locked writable root, failures visible as `memory-error` | §3.5 Memory, §8 M1 |
| 9 | CI: Ubuntu `test` job (protocol + daemon coverage, app unit) plus `app-e2e` on `macos-14` with `--project=ci` | §9 |
| 10 | No copying of `~/.claude/.credentials.json` or a Chrome profile anywhere | `AGENTS.md`, §2.6 |
| 11 | Human gates left honestly open, and no plan requirement quietly relaxed to fit what shipped | task framing, §11 |

---

## What I verified myself

### Merged state matches the claim

`git ls-remote` → `refs/heads/main = a80dd6b8c96c…`. The four claimed SHAs map exactly:

```
9648d1d Rewrite README for local OpenBot, not Botbox. (#18)
0c0c8bc Commit orch program, M3 ask record, and pass1–3 judgments. (#19)
f5e525d Ad-hoc sign OpenBot.app as com.openbot.app with entitlements. (#20)
a80dd6b Record pass-3 README, artifacts, and ad-hoc signing on main. (#21)
```

All 21 PRs are `MERGED`. GitHub Actions `ci` is `success` on `a80dd6b`, `f5e525d`, `0c0c8bc`, `9648d1d`, `a8f1cdf`, `015fc52`.

### Suites — re-run by me in a fresh clone of `origin/main`

| Command | Result |
|---|---|
| `pnpm typecheck` (3 packages) | green |
| `pnpm --filter @openbot/protocol test` | **56 tests**, green |
| `pnpm --filter @openbot/daemon test --coverage` | **22 files / 82 tests** green, **80.83%** lines (floor 80%) |
| `pnpm --filter @openbot/app test` | **14 files / 48 tests** green |
| `playwright test --project=ci` | **27 passed**, 0 skipped (43s) |
| `playwright test --project=local-ax` | **4 passed** (fake helper, no Accessibility) |

Protocol assertions genuinely encode the plan's pins, not vague stand-ins — I read them: `roleMd` rejected, `peer-rate-limit` rejected, `usage` `.strict()` with `costUsd: null` accepted, `resume-continue` / `clear` accepted, `EventStreamMetaSchema` with `replayReset`, `needs-site` / `memory-error` banners.

The app's UI contract is really implemented, not stubbed: `composer-primary` with `data-mode` send/stop/resume, `agent-status` → `working`, `resume-hint` → **Resume to send**, `Context compacted` / `New conversation` divider labels, `Jump to latest`, `Waiting for usage`, `You're driving` / `Return control` in `Chrome.tsx`, `Coming in a later build` tooltips, `Unknown command…`, `OpenBot needs Apple Silicon.` in main.

### Packaged app — my own `codesign`, not the implementer's paste

On `…-wt-p3-signing/packages/app/dist/mac-arm64/OpenBot.app`:

```
Identifier=com.openbot.app
CodeDirectory v=20500 flags=0x10002(adhoc,runtime)
Signature=adhoc     Sealed Resources version=2 rules=13 files=70314
entitlements: apple-events, allow-jit, allow-unsigned-executable-memory, disable-library-validation
```

`codesign --verify --deep --strict` exits clean with no output. `Info.plist` `CFBundleIdentifier = com.openbot.app`. No App Sandbox key. `Contents/Helpers/openbot-axclick` present, mode 755. `scripts/dev/verify-packaged-app.sh` passes all 11 of its own checks.

The Hindsight bundle is real, not a stub: `python/bin/python3 --version` → **3.11.15**, `hindsight-all` → **0.9.0**, and both baked models are on disk as `model.safetensors` (`BAAI/bge-small-en-v1.5`, `cross-encoder/ms-marco-MiniLM-L-6-v2`, 226 MB cache). Sizes: hindsight 2.5 G, packaged daemon 3.1 M, whole app 3.1 G.

### The plan was tightened, never loosened

I diffed the committed plan against the working copy line-set. The only requirement-level changes are stricter: `identity: "-"` replacing `identity: null` (with the discrepancy documented), a packaged-daemon spawn lock, a composed-package proof that fails closed under 100 MB, and a login screen-recording preflight pin. Nothing in the bar was weakened to fit what shipped. This is the check I most expected to fail, and it passed.

### Other bar items confirmed

- M2a really was contract-only: `Chrome.tsx` first appears in `22c5c49 Add M5 browser and terminal right-pane tabs.`
- Codex uses `app-server --listen stdio:// --strict-config`; live fixtures show a real turn (`OPENBOT_M1B_OK`) and `codex exec resume` (`OPENBOT_M1B_RESUME_OK`); `probe3-write-scope.md` records the permission profile passing under `--strict-config` (Desktop write OK, other-agent write denied, private read denied, other-agent read allowed).
- No credential copying anywhere; the only hits are the ban text and OpenBot's own `claude-config/.credentials.json` existence probes. No Chrome-profile copy.
- CI has no `bot-image` step; `app-e2e` runs on `macos-14` with `--project=ci`.
- Daemon handles every protocol message type in the schema set.
- `toolAliases` really does exist in the pinned SDK 0.3.232 `sdk.d.ts` (with the documented `{ Bash: 'mcp__workspace__bash' }` example), so the Claude preferred-shell wiring is legitimate.
- Human gates are stated as open in the records, not quietly claimed: `m1-smoke-max-pro`, `m2b-allow-click`, `m7-human`.

---

## Gaps — engineering work still to do

### G1 (most serious) — live memory has never run

Every daemon test (`grep skipHindsightSpawn`: 10 test files plus `test/helpers.ts` defaulting to `true`) **and** `packages/app/scripts/start-real-daemon.mjs:20` set `skipHindsightSpawn: true`. So M1's "Done when … Hindsight retain+snapshot runs after a user/peer turn" is satisfied only against a fake HTTP client. The one live Codex run notes it plainly: "Hindsight MCP recall failed (skipHindsightSpawn daemon)".

To separate "unproven" from "broken", I started the bundled server myself (`bin/hindsight-api --host 127.0.0.1 --port 18991`) and called the API. Good news for the plan's pins, all previously unchecked:

| Locked stop-and-revise pin | My result |
|---|---|
| `PUT /v1/default/banks/{uuid}` 404s → stop and revise | **200**, returns the bank; no revise needed |
| Hindsight MCP path `/mcp/<bankId>/` 404s → stop and revise | **200**, `initialize` answers as `hindsight-mcp-server 0.9.0` |
| `POST …/memories/recall` shape | **200** `{"results":[]}` |
| `HINDSIGHT_API_LLM_PROVIDER=openai-codex` is a real provider id | present in the bundled `config.py`; `claude_code_llm.py` / `codex_llm.py` ship |
| `--host` / `--port` flags exist (M1 probe the plan asked for) | yes, `--help` lists both |

But retain is where the product actually stores memory, and it needs a working language-model provider: with a placeholder key it returns **500 `Fact extraction failed … AuthenticationError`**. Nobody has run it with the real `claude-code` / `openai-codex` provider, so OpenBot has never stored or recalled a single memory. Since Codex login works on this Mac, this was runnable without the Claude gate.

### G2 — memory data lands outside the locked writable root

§3.5 locks the writable data root at `~/.openbot/hindsight/data`. `hindsight-spawn.ts` creates that directory but passes no database/data setting, and Hindsight's embedded PostgreSQL (pg0) uses its own default. On this Mac: `~/.pg0/instances/hindsight/instance.json` → `"data_dir": "/Users/aadivyar/.pg0/instances/hindsight/data"`, while `~/.openbot/hindsight/data` **does not exist**. Two consequences: memory data escapes `~/.openbot`, and the Codex deny rule `"…/.openbot/hindsight" = "deny"` therefore does not cover the real database — an agent can read and write it through `:root = "write"`.

### G3 — "first use initializes offline" is not true as written

The plan promises first use with no download. Weights are baked, so the Hugging Face half holds (`HF_HUB_OFFLINE=1` is set and the cache is bundled). But pg0 fetches PostgreSQL binaries at first start: the bundled `pg0` binary embeds `https://github.com/theseus-rs/postgresql-binaries` (via `postgresql_embedded 0.20.0`), and `~/.pg0/installation/18.1.0` appeared during this work. A stranger with no network — or a corporate network blocking GitHub — gets no memory. Neither the plan nor any record notes this.

### G4 — M4's "real surface" is the fake daemon

`packages/app/scripts/m4-real-surface.mjs` spawns `e2e/fake-daemon.ts` with `scenario=peer` and asserts against fixture parts. The plan's M4 verify is "that Playwright file **and** two agents in the real app" — A actually calling `message_agent`. Real peer delivery exists in the daemon and is unit-tested (`peer.test.ts`), but A-messages-B has never happened between two live agents. M3, M5 and M6 drives do use the real daemon; M4 is the odd one out.

### G5 — M5's agent-driven half is unverified

`m5-real-surface.mjs` does a genuine human-side drive against the real daemon: real `https://example.com` load in `WebContentsView`, take control → **You're driving** → **Return control**, `Ctrl+\`` terminal with a typed command. The plan's M5 verify list also requires the agent side: `browser_navigate` to a new host → `needs-site` banner → **allow-site** → page loads; a second agent-opened tab coming to the front; the window closed and an already-allowed navigation succeeding without the window appearing (`stayHidden`); an agent shell command creating a visible Terminal tab without stealing focus; `terminal_read` returning what the user typed. All of that is unit- or fixture-tested only.

### G6 — Codex ships with its built-in shell off and no live proof the replacement works

`buildCodexConfigToml` emits `shell_tool = false` unless `shellToolFalse === false`, and nothing in `src/` ever passes `false` — only tests do. MCP `shell_run` requires a connected app and returns `no-app` after 30s otherwise. The permission probe had to flip `shell_tool = true` to run any command at all ("with `shell_tool = false` and no MCP shell, the model could not run commands"), and there is no live fixture showing `mcp_tool_call` / `shell_run` succeeding. So the plan's M5 probe ("Codex `shell_tool = false` → `mcp_tool_call`") was never run live, and the capability-first rule — never disable a real harness capability for UI — is at risk in the shipped config.

### G7 — the app window has never been driven with a live harness turn

`m3-real-surface.mjs` would do exactly this, but it fails closed on the Claude login gate. The live Codex verification is daemon-level only (WebSocket client, no window). So "the real window plus a real agent thinking" has not been seen. Part of this is the accepted Claude gate, but a Codex-through-the-window drive was available and would have closed it.

### G8 — the user's own checkout shows none of this

Local `main` is `f624a0f` (2 commits) while `origin/main` is `a80dd6b`; locally `packages/` contains only `protocol`, and the untracked `planning/boxbot-local-plan.md` in the main worktree still says `mac.identity: null`, contradicting the committed plan's `identity: "-"`. All the work lives in 20+ sibling worktrees. Someone opening the project folder sees the old Botbox tree and a stale plan.

### Minor

`packages/daemon/src/daemon.ts` is roughly 2,000 lines carrying the request router, turn engine, memory wiring and harness switch, at **71.79%** line coverage; the 80% floor is cleared only in aggregate (80.83%). It is the natural place for the next regression to hide.

---

## Human gates — correctly still open, not counted against the work

| Gate | Status |
|---|---|
| `m1-smoke-max-pro` — real Claude Code turn (`smoke.mjs`, `ask-probe.mjs`, M3 Claude ask) | Blocked by the vendor's "Claude Max or Pro is required" wall. Honestly recorded; no invented evidence. |
| `m2b-allow-click` — Allow-click login E2E on the ad-hoc build | Open. Needs a human to re-grant Accessibility + Screen Recording after each ad-hoc rebuild. The signing record explicitly says it is not closed. |
| `m7-human` — stranger test | Not started, as expected. |

Developer-ID + notarize is correctly documented as a follow-on, not an M2b blocker.

---

## Why not PASS, and why not FAIL

**Not FAIL.** I went looking for inflated claims and found none. Suites are green when I run them, the signature and entitlements are real, the Hindsight bake is real, the plan edits tighten rather than relax, and the open gates are named in the repo rather than papered over.

**Not PASS.** Memory is a headline promise of this product — "one bank per agent, live Hindsight" — and it has never run outside fakes (G1). Two locked mechanisms in §3.5 are silently not holding in reality (G2 data root, G3 offline first use). Two milestone verify lists are only partly done in the surface a user drives (G4 M4, G5 M5 agent side). None of these are human gates; all are ordinary engineering.

## Suggested order to close

1. Turn memory on once, end to end: real provider, real bundled server, a user turn, assert retain 200 and `MEMORY.md` rewritten — this is what would have caught G2 and G3.
2. Point Hindsight's database at `~/.openbot/hindsight/data` (or change the plan and the Codex deny list to match reality, deliberately).
3. Decide what happens when PostgreSQL cannot be downloaded: either bundle it or make the offline path a visible, actionable `memory-error` and correct the plan's "initializes offline" wording.
4. Two real agents messaging each other (G4) and the agent-driven browser/terminal ops (G5) — both reachable with Codex today.
5. Run the Codex shell probe live (G6); if MCP `shell_run` cannot work, ship `shell_tool = true`.
6. Bring the user's `main` up to `a80dd6b` and remove the stale local plan copy (G8).

## Reproducing this judgment

```bash
git clone https://github.com/aadivyaraushan/botbox.git /tmp/openbot-judge
cd /tmp/openbot-judge && pnpm install
pnpm typecheck
pnpm --filter @openbot/protocol --filter @openbot/daemon test --coverage
pnpm --filter @openbot/app test
pnpm --filter @openbot/app build
pnpm --filter @openbot/app exec playwright test --project=ci       # 27
pnpm --filter @openbot/app exec playwright test --project=local-ax # 4

APP=~/Documents/Startups/grok-bot-clone-wt-p3-signing/packages/app/dist/mac-arm64/OpenBot.app
codesign -dv --verbose=4 "$APP"
codesign -d --entitlements - "$APP"
codesign --verify --deep --strict "$APP"
bash scripts/dev/verify-packaged-app.sh "$APP"

# live Hindsight probe (what nobody had run)
"$APP/Contents/Resources/hindsight/bin/hindsight-api" --host 127.0.0.1 --port 18991 &
curl -X PUT -d '{}' -H 'content-type: application/json' \
  http://127.0.0.1:18991/v1/default/banks/11111111-2222-3333-4444-555555555555
curl -X POST -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"judge","version":"1"}}}' \
  http://127.0.0.1:18991/mcp/11111111-2222-3333-4444-555555555555/
```

Side effects I created and undid: a throwaway pg0 instance `openbot-judge` (dropped with `pg0 drop --name openbot-judge -f`; only `hindsight` remains) and the clone at `/tmp/openbot-judge`. I changed nothing in the repository or in `~/.openbot`.

<!-- GateGuard: pass-4 independent judgment. Callers: parent orchestrator, human review, orch checkpoint saved-results/openbot-orch-program-2026-08-14.md. User: "Return PASS / PASS-WITH-GAPS / FAIL with evidence. Save to saved-results/openbot-m0-m6-orch-judgment-2026-08-15-pass4.md." -->
