# Botbox — Verified technical facts (appendix to botbox-plan.md)

**Date verified:** 2026-08-12, via live doc fetches (subagent research). Anything not listed here that an implementer needs must be re-verified at implementation time. Items marked ⚠️ were NOT fully verified — the plan includes fallbacks for each.

## Claude Code (docs: code.claude.com/docs)

- Headless send: `claude -p "<msg>" --output-format stream-json --verbose --include-partial-messages` (`--verbose` is required with stream-json; `--include-partial-messages` requires both `-p` and stream-json).
- Stream events: `system/init` (first; has `session_id`, `model`, `tools`, `mcp_servers`), `assistant` / `user` (message turns), `stream_event` (token deltas), `result` (last line; has `result`, `total_cost_usd`, `session_id`, `subtype: success|error_max_turns|error_during_execution|...`), `system/api_retry`.
- Resume: `--resume <session-id>` (works across directories). Force id on new session: `--session-id <uuid>`. Branch: `--fork-session`. Sessions persist indefinitely at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`; no documented resume-count limit ⚠️ (no explicit ceiling stated either way).
- Auto-compact: works headless; tunable via `--autocompact <auto|tokens>` (e.g. `--autocompact 500k`).
- System prompt: `--append-system-prompt-file <path>` (append) / `--system-prompt-file <path>` (replace). SDK equivalent exists.
- Hooks: full event list incl. `Stop` (fires once per assistant turn); hooks work in `-p` mode; stdin JSON includes `session_id`, `transcript_path`, `last_assistant_message`.
- MCP: `--mcp-config <path>` (+ `--strict-mcp-config` to ignore other sources); project `.mcp.json` auto-loads. Tool names: `mcp__<server>__<tool>`.
- Unattended permissions: `--dangerously-skip-permissions` or `--permission-mode bypassPermissions`; allowlist via `--allowedTools`.
- Auth headless: `ANTHROPIC_API_KEY` env var, or one-time interactive `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` (1-year, subscription-backed).
- Agent SDK (`@anthropic-ai/claude-agent-sdk`): spawns a CLI subprocess per `query()`; continuity is via resume-on-disk, not a live process. For a daemon, CLI + `--resume` per turn is the supported model either way.

## Codex CLI (docs: learn.chatgpt.com / developers.openai.com)

- Headless send: `codex exec "<msg>" --json` → JSONL on stdout. Events: `thread.started` (has `thread_id`), `turn.started`, `turn.completed`, `turn.failed`, `item.started`/`item.completed` (item types: `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `web_search`, `plan_update`), `error`.
- Resume: `codex exec resume <SESSION_ID> "<msg>"` (or `resume --last`). Sessions = JSONL under `~/.codex/sessions/YYYY/MM/DD/`. Resume replays transcript. Auto-compaction fires near `model_auto_compact_token_limit`; no documented resume-count limit.
- Instructions: `AGENTS.md` auto-discovered (global `~/.codex/AGENTS.md`, then project-root→cwd, 32 KiB cap default); config.toml `developer_instructions` (injected as developer message) or `model_instructions_file` (full replacement). No verified `--append-system-prompt` CLI flag ⚠️ (third-party claim only — use AGENTS.md).
- Unattended: `--sandbox {read-only|workspace-write|danger-full-access}` + `--ask-for-approval never`; `--dangerously-bypass-approvals-and-sandbox` exists, docs say only inside an external sandbox (our container qualifies).
- MCP: config.toml `[mcp_servers.<name>]` (`command`, `args`, `env`, `startup_timeout_sec`, `required`, …) or `codex mcp add <name> -- <command>`; works in exec mode; `required = true` servers fail the run loudly. ⚠️ Open GitHub issue #15451 claims `--json` can be silently ignored when MCP tools are active — retest at M5.
- Auth headless: `printenv OPENAI_API_KEY | codex login --with-api-key`; per-invocation `CODEX_API_KEY` (exec only); ChatGPT-plan headless via `codex login --device-auth` (beta).
- Config: `~/.codex/config.toml` (user), `.codex/config.toml` (project), `CODEX_HOME` overrides base dir.
- Cursor `cursor-agent`: mature headless CLI with NDJSON output (web-search synthesis, not doc-verified ⚠️) — deferred to good-first-issue anyway.

## Desktop streaming / container

- linuxserver Webtop now uses **Selkies** (WebSocket stream, port 3000/3001): no documented programmatic input-injection API ⚠️ → rejected for our takeover feature.
- **Chosen pattern instead: X11 + x11vnc + noVNC/websockify** (same as Anthropic's computer-use reference container: raw VNC 5900, noVNC web client 6080). VNC protocol *is* the input surface: view + takeover both come free via noVNC (`?view_only=true` URL param for the sidebar), and any VNC client library can inject input. In-container `xdotool` available as a second input path.
- Neko (m1k1o/neko, Apache-2.0, WebRTC + XTEST + REST/WS API) is the upgrade path if VNC latency disappoints — noted, not v1.
- Chrome + CDP: launch visible Chrome with `--remote-debugging-port=9222 --user-data-dir=<non-default-dir>`; Playwright attaches via `connectOverCDP`. **Chrome ≥136 blocks remote debugging on the default profile** — non-default `--user-data-dir` is mandatory (we want a dedicated persistent profile dir anyway).
- ⚠️ `apt install chromium-browser` on Ubuntu 24.04 is a snap wrapper (breaks in unprivileged containers — judge-flagged, not independently re-verified): plan uses `google-chrome-stable` from Google's apt repo instead; M1 image test is the verification.
- ⚠️ Whether headless `claude -p` auto-reads `CLAUDE.md` from cwd (and re-reads it on resumed sessions after compact) is NOT verified — M3 step 6 resolves empirically; fallback specified in plan §4.3.

## Tailscale

- Container egress via a specific exit node = **sidecar pattern** (Tailscale's own documented Docker guidance): run `tailscale/tailscale` sidecar container, target container uses `network_mode: "container:<sidecar>"` (compose: `service:<sidecar>`); all its traffic uses the sidecar's tailnet routing. Known caveat: DNS must go through Tailscale (accept-dns/MagicDNS) or resolution breaks once routed.
- macOS advertises exit node via GUI (menu → Exit Node → Run Exit Node as…) or `tailscale up --advertise-exit-node`; must be approved in admin console (or ACL auto-approvers).
- Client use: `tailscale up --exit-node=<ip-or-name> --exit-node-allow-lan-access`.
- **Exit node offline = hard fail, no automatic fallback** (verified). Botbox must surface this and offer per-bot one-click disable.
- Non-interactive join: `tailscale up --auth-key=tskey-auth-… --ssh` (one-off keys auto-revoke after first use; use reusable keys for multi-container provisioning).
- Headscale supports exit nodes (`headscale nodes approve-routes … --routes 0.0.0.0/0,::/0`) — the fully-self-hosted path works.

## README / repo blueprint (from Evokoa/pgGraph + aadivyaraushan/hindsight analysis)

Copy hindsight's shape (129-line README): centered banner + `<h1>` + one bold plain-English tagline + 3–5 function-relevant badges → **hook** (relatable pain quote) → 2 short paragraphs → **show the artifact** (screenshot/gif here, since Botbox's value is a UI+process) → `## How it works` (one mermaid diagram + numbered steps) → `## Install` (copy-pasteable, "That's it.") → trust/limits **table** → `## FAQ` (preempt skepticism: costs, security, "is my traffic really my IP?") → `## How it's built` (prose→filepath map) → `## Contributing` → `## License` (MIT).
From pgGraph take the hygiene hindsight lacks: `.github/ISSUE_TEMPLATE/` (bug_report, feature_request), `CONTRIBUTING.md`, CI workflow + badge, `SECURITY.md`. Raw reference READMEs saved in scratchpad (`pgGraph_README.md`, `hindsight_README.md`).
