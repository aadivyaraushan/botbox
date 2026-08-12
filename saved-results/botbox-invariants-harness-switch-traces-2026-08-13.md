# Botbox invariants — harness switch compact + traces + logos

**Date:** 2026-08-13
**What it's for:** Decisions locked after the UI concept review. The plan (`planning/botbox-plan.md`) and facts appendix were amended to match. Concept mockup: `saved-results/botbox-ui-concept-2026-08-13.html`.

## Result

Three invariants, all binding:

1. **Compact-on-switch.** Changing Claude Code ↔ Codex does not start the other CLI blind and does not replay the raw transcript. The daemon snapshots the visible transcript since that harness was last current, runs a cheap one-shot compact (Haiku, no tools), injects it into the destination session as a hidden `harness-switch-compact` message, and the UI shows a divider (`Compacted for Codex` / `Compacted for Claude Code`). Switching back compact-injects only the turns the returning harness has not seen.

2. **Real product marks, black and white.** Composer icons are the actual Claude Code spark and the Codex/OpenAI blossom, `fill="currentColor"` — not decorative stand-ins. Codex has no separate official glyph; the Codex IDE extension icon is `blossom.dark.png` (Open VSX `openai.chatgpt` 26.5803.61601, fetched 2026-08-13).

3. **Part timeline with reasoning.** Coding-agent turns show reasoning tokens and tool traces the way Claude Code, Codex, and OpenCode do. OpenCode `PART_MAPPING` (`reasoning` / `tool` / `text` / `compaction`) at `anomalyco/opencode@5d2dc888` is the OSS reference. Reasoning is first-class; it is not dropped.

## Context

User feedback on the concept: “more or less pretty good,” then these three points. Velocity cuts remain rejected. Implementation still waits for an explicit go.

## Judge

Adversarial judge signed off 2026-08-13: all three invariants pass; no remaining must-invent gaps; plan **ready** for implementation. Earlier fails (crash-safe switch, event ids, destination inject without tools, stream envelope, marker lookup) were patched into `planning/botbox-plan.md` before this pass.

Read `planning/botbox-plan.md` §4.1 (`HarnessEvent` includes `reasoning-text` and `compacted`), §4.3 (compact-on-switch numbered steps + trace UI table), M3 `harness-switch.test.ts` / `thinking.jsonl`, M4 Playwright part-timeline + compact divider. Refresh the HTML mockup in a browser; harness switch only works in the Idle preview state.
