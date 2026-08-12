# Botbox host: Debian box, not Hetzner Ubuntu

**Date:** 2026-08-13
**What it's for:** The real install target is an existing Debian VM, not a newly created Hetzner CX33.

## Result

| | Plan used to say | Now |
|---|---|---|
| Host OS | Ubuntu 24.04 | Debian 12 (bookworm) bootstrap; record real `VERSION_ID` at M6 |
| Host size | CX33: 4 vCPU / 8 GB / 80 GB | 8 vCPU / 16 GB / 128 GB |
| Bot image | `ubuntu:24.04` | unchanged. Claude Code / Codex run here, not on the host |
| Get-a-box | required guided path | optional, for other people. Author path skips it |

Capacity at 4g/2-cpu per bot: about two bots with room for Docker and the OS.

## Why

Ubuntu-only bootstrap would fail or be untested on this box. The agents themselves still see Ubuntu inside Docker, which is what those CLIs expect.

## How to reuse

`planning/botbox-plan.md` §4.8 and M6. First command on the box: `cat /etc/os-release`. If `VERSION_ID` is 13, use Docker's Debian 13 repo in the same bootstrap script.
