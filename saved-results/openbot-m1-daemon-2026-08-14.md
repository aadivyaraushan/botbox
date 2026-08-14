# OpenBot M1 daemon ship notes

**Date:** 2026-08-14  
**What for:** Record M1 `@openbot/daemon` delivery, verify commands, and live Claude blocker.  
**PR:** https://github.com/aadivyaraushan/botbox/pull/2  
**Commit:** `d74c38e` on `openbot/m1-daemon`

## Result

- Daemon package green: 41 tests, coverage lines **80.65%**.
- CI includes `pnpm --filter @openbot/daemon test --coverage` without pnpm action `version`.
- Live `smoke.mjs` / Claude Code login blocked: OAuth completes to vendor page **Claude Max or Pro is required to connect to Claude Code**. Also fixed login URL parser that previously appended `Paste` to `state=`.

## Reproduce unit verify

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-m1
pnpm --filter @openbot/daemon test --coverage
```

## Reproduce live (after Max/Pro Claude Code login)

```bash
export OPENBOT_HOME=~/.openbot
export OPENBOT_ADMIN_TOKEN=$(openssl rand -hex 32)
# login into $OPENBOT_HOME/claude-config via daemon harness.startLogin or claude auth login
node packages/daemon/scripts/smoke.mjs
node packages/daemon/scripts/ask-probe.mjs
```

## Context

Docs: Context7 `/websites/code_claude_en_agent-sdk` for `query` options (`env`, thinking adaptive); Hindsight HTTP bank/memory APIs for retain/DELETE behavior (404 proceed / non-404 abort).
