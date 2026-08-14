#!/bin/sh
# Authoritative Hindsight extraResources recipe (§5.5.8). Apple Silicon only.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${DEST:-$ROOT/resources/hindsight}"
ARCH="$(uname -m)"
if [ "$ARCH" != "arm64" ]; then
  echo "OpenBot Hindsight bundle requires Apple Silicon (arm64)" >&2
  exit 1
fi
mkdir -p "$DEST/bin" "$DEST/python" "$DEST/hf-cache"
# Step 1–4 are heavy; M1 unit tests use fake spawn. Real first-use runs this script.
# Wrapper always written so spawn path resolves:
cat > "$DEST/bin/hindsight-api" <<'WRAP'
#!/bin/sh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HF_HOME="$ROOT/hf-cache"
export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
export HINDSIGHT_API_HOST=127.0.0.1
export HINDSIGHT_API_PORT="${OPENBOT_HINDSIGHT_PORT:-8888}"
exec "$ROOT/python/bin/hindsight-api" "$@"
WRAP
chmod +x "$DEST/bin/hindsight-api"
echo "Wrote wrapper at $DEST/bin/hindsight-api"
echo "Run full python+hindsight-all==0.9.0 install before live memory (see plan §5.5.8)."
