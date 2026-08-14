# Probe 3 write-scope (--strict-config) — PASS

codex-cli 0.147.0, permission profile `default_permissions = "openbot"` with absolute filesystem keys.

Observed:
- Desktop write: OK (`DESKTOP_EC=0`, file created)
- Other-agent write: DENIED (`operation not permitted`, no pwned.txt, OTHER_EC=1)
- Private/team.json read: DENIED (`Operation not permitted`, PRIVATE_EC=1)
- Other-agent read: ALLOWED (`bea-secret`, OTHER_READ_EC=0)

Note: with `shell_tool = false` and no MCP shell, the model could not run commands; probe used `shell_tool = true` to exercise the permission profile (capability-first).
