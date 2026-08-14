# Real turn + resume evidence

- Date: 2026-08-14
- THREAD: `01a00113-4440-7382-9377-30e892ac357f`
- REAL_TURN_OK: True (app-server JSON-RPC; reply `OPENBOT_M1B_OK`)
- REAL_RESUME_OK: True (`codex exec resume`; reply `OPENBOT_M1B_RESUME_OK`; exit 0)
- Evidence: `live-app-server-turn-completed.json`, `live-exec-resume.jsonl`, `live-thread-id.txt`, `live-verify-summary.txt`
- CODEX_HOME: `/tmp/openbot-m1b-verify/codex-home` (auth copied from `~/.openbot/codex-home`)
- argv resume: `codex exec resume <thread> "…" --json --strict-config --dangerously-bypass-hook-trust --skip-git-repo-check --model gpt-5.6-luna -c model_reasoning_effort=low`
