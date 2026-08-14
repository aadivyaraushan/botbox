# OpenBot Hindsight live verify

**Date:** 2026-08-15
**For:** pass-4 p4-hindsight acceptance (G1–G3)

## Result

- Spawn OK on port 18993
- `data_dir` under data root: `/var/folders/7m/tqp4jmd16d70pn19s27wvm080000gn/T/openbot-hs-live-glUnz3/hindsight/data/.pg0/instances/hindsight/data`
- Retain+snapshot OK; MEMORY.md bytes=111
- Recall OK; results=1

## Inputs

- OPENBOT_HOME (temp): `/var/folders/7m/tqp4jmd16d70pn19s27wvm080000gn/T/openbot-hs-live-glUnz3`
- OPENBOT_HINDSIGHT_ROOT: `/Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-hindsight/resources/hindsight`
- CODEX_HOME (auth source): `/Users/aadivyar/.openbot/codex-home`
- bankId: `19569ae9-c661-4076-a74d-01da0b089bbd`
- marker: `OpenBot live verify marker 19569ae9 prefers blue notebooks.`

## Reproduce

```bash
cd /Users/aadivyar/Documents/Startups/grok-bot-clone-wt-p4-hindsight
CODEX_HOME=~/.openbot/codex-home OPENBOT_HINDSIGHT_ROOT=$PWD/resources/hindsight \
  node packages/daemon/scripts/hindsight-live-verify.mjs
```

## MEMORY.md (clipped)

```
- OpenBot live verify marker 19569ae9 prefers blue notebooks. | Involving: OpenBot live verify marker 19569ae9

```

## Recall sample

```
OpenBot live verify marker 19569ae9 prefers blue notebooks. | Involving: OpenBot live verify marker 19569ae9
```
