#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$ROOT/packages/app/src/assets"
mkdir -p "$ASSETS/harness"

curl -fsSL --compressed -o /tmp/openbot-claude.vsix   "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/anthropic/vsextensions/claude-code/2.1.228/vspackage"
rm -rf /tmp/openbot-claude-vsix
unzip -o /tmp/openbot-claude.vsix -d /tmp/openbot-claude-vsix >/dev/null
cp /tmp/openbot-claude-vsix/extension/resources/claude-logo.svg "$ASSETS/harness/claude-code.svg"

python3 - "$ASSETS" <<'PY'
import hashlib, re, pathlib, sys
root = pathlib.Path(sys.argv[1])
claude = (root / "harness/claude-code.svg").read_text()
m = re.search(r'<path[^>]*\sd="([^"]+)"', claude)
assert m, "no path d in claude svg"
h = hashlib.sha256(m.group(1).encode()).hexdigest()
assert h == "7c9c195500ec3caed3a183d8f8758a2252955ee76af691b3fc5c20b3cd8caa58", h
print("claude path-d ok")
PY

curl -fsSL "https://raw.githubusercontent.com/simple-icons/simple-icons/15.16.0/icons/openai.svg"   -o "$ASSETS/harness/codex.svg"

python3 - "$ASSETS" <<'PY'
import hashlib, re, pathlib, sys
root = pathlib.Path(sys.argv[1])
codex = (root / "harness/codex.svg").read_text()
m = re.search(r'<path[^>]*\sd="([^"]+)"', codex)
assert m, "no path d in codex svg"
h = hashlib.sha256(m.group(1).encode()).hexdigest()
assert h == "3fae9b38d571a5ab5aa662bc279dcda580855d6ca6b35330e4b4ba171367ffb1", h
print("codex path-d ok")
PY

python3 - "$ASSETS" <<'PY'
import re, pathlib, sys
root = pathlib.Path(sys.argv[1]) / "harness"
for name in ("claude-code.svg", "codex.svg"):
    p = root / name
    s = p.read_text()
    def repl_attr(m):
        attr, val = m.group(1), m.group(2)
        if val.strip().lower() == "none":
            return m.group(0)
        return f'{attr}="currentColor"'
    s = re.sub(r'(fill|stroke)="([^"]*)"', repl_attr, s)
    def add_fill(m):
        tag = m.group(0)
        if "fill=" in tag:
            return tag
        return tag[:-1] + ' fill="currentColor">'
    s = re.sub(r'<path[^>]*>', add_fill, s)
    p.write_text(s)
    assert "currentColor" in s
    assert "#D97757" not in s
    assert 'fill="#000000"' not in s
    print("recolored", name)
PY

swift "$ROOT/scripts/render-menubar-icons.swift" "$ASSETS"
ls -la "$ASSETS" "$ASSETS/harness"
