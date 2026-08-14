# Probe 2 stop-and-revise → app-server

## Fail (locked plan path)

`codex exec --json` with `default_mode_request_user_input = true`:

- Model attempts `request_user_input`
- Embedded app-server rejects: `request_user_input is not supported in exec mode for thread …`
- No `request_user_input` JSONL item is emitted
- Stdin cannot answer (exec also reads piped stdin as prompt `<stdin>` block until EOF)

Evidence: `probe2-request-user-input-exec-fail.jsonl` + `.err.txt`

## Pass (revised path)

`codex app-server --strict-config` JSON-RPC:

1. `initialize` → `thread/start` → `turn/start`
2. Server request `item/tool/requestUserInput` with `questions[].question/header/options`
3. Client response `{ answers: { <id>: { answers: ["Alpha"] } } }`
4. Turn continues (`DONE:Alpha`) then `turn/completed`

Evidence: `request-user-input.jsonl`, `request-user-input-answer.jsonl`, `probe4-app-server-ask.jsonl`

## Mapping pins

- question text = `params.questions[].question`
- header = `params.questions[].header` (else first 12 chars of question)
- options[].label / description from fixture
- multiSelect = false (Codex answers are string arrays; UI still single-select unless product adds multi later)
- On `ask.answer`: JSON-RPC **response** to the pending `item/tool/requestUserInput` request id (not child stdin)
