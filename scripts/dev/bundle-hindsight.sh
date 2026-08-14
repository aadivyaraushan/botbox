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

PBS_TAG="${OPENBOT_PBS_TAG:-20260807}"
PY_VER="${OPENBOT_PY_VER:-3.11.15}"
ASSET="cpython-${PY_VER}+${PBS_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz"
URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${ASSET}"

mkdir -p "$DEST/bin" "$DEST/python" "$DEST/hf-cache"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

echo "[bundle-hindsight] downloading $URL"
curl -fsSL -o "$TMP/$ASSET" "$URL"
SHA="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"
echo "[bundle-hindsight] pythonStandaloneSha256=$SHA"

# install_only_stripped unpacks a top-level python/ directory
tar -xzf "$TMP/$ASSET" -C "$TMP"
rm -rf "$DEST/python"
mv "$TMP/python" "$DEST/python"

echo "[bundle-hindsight] pip install hindsight-all==0.9.0"
"$DEST/python/bin/python3" -m pip install --upgrade pip
"$DEST/python/bin/python3" -m pip install 'hindsight-all==0.9.0'

if [ ! -x "$DEST/python/bin/hindsight-api" ]; then
  echo "[bundle-hindsight] console script hindsight-api missing after install; stop and revise" >&2
  ls "$DEST/python/bin" >&2 || true
  exit 1
fi

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

echo "[bundle-hindsight] baking model weights into hf-cache"
HF_HOME="$DEST/hf-cache" "$DEST/python/bin/python3" <<'PY'
from sentence_transformers import SentenceTransformer
from sentence_transformers.cross_encoder import CrossEncoder
SentenceTransformer('BAAI/bge-small-en-v1.5')
CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')
print('weights baked')
PY

SMOKE_PORT="${OPENBOT_HINDSIGHT_SMOKE_PORT:-18999}"
SMOKE_DATA="$(mktemp -d)"
echo "[bundle-hindsight] smoke start on $SMOKE_PORT (data=$SMOKE_DATA)"
(
  cd "$SMOKE_DATA"
  OPENBOT_HINDSIGHT_PORT="$SMOKE_PORT" \
  HF_HOME="$DEST/hf-cache" HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
  HINDSIGHT_API_LLM_API_KEY="${HINDSIGHT_API_LLM_API_KEY:-smoke-placeholder}" \
  HINDSIGHT_API_LLM_PROVIDER="${HINDSIGHT_API_LLM_PROVIDER:-openai}" \
  HINDSIGHT_API_LLM_MODEL="${HINDSIGHT_API_LLM_MODEL:-gpt-4o-mini}" \
  HINDSIGHT_API_EMBEDDINGS_PROVIDER=local \
    "$DEST/bin/hindsight-api" --host 127.0.0.1 --port "$SMOKE_PORT"
) &
SMOKE_PID=$!
ok=0
i=0
while [ "$i" -lt 90 ]; do
  if curl -fsS "http://127.0.0.1:${SMOKE_PORT}/" >/dev/null 2>&1 \
    || curl -fsS "http://127.0.0.1:${SMOKE_PORT}/health" >/dev/null 2>&1 \
    || curl -fsS "http://127.0.0.1:${SMOKE_PORT}/docs" >/dev/null 2>&1; then
    ok=1
    break
  fi
  i=$((i + 1))
  sleep 1
done
kill "$SMOKE_PID" 2>/dev/null || true
wait "$SMOKE_PID" 2>/dev/null || true
rm -rf "$SMOKE_DATA"
if [ "$ok" != "1" ]; then
  echo "[bundle-hindsight] smoke HTTP failed on port $SMOKE_PORT" >&2
  exit 1
fi
echo "[bundle-hindsight] smoke ok"

PACKAGING_DEST="$ROOT/resources/hindsight"
case "$DEST" in
  "$PACKAGING_DEST"|"$PACKAGING_DEST/")
    TREE_SHA="$(find "$DEST" -type f | sort | xargs shasum -a 256 | shasum -a 256 | awk '{print $1}')"
    PIN="$ROOT/packages/daemon/src/memory/hindsight-pin.json"
    cat > "$PIN" <<EOF
{
  "python": "${PY_VER}",
  "hindsightAll": "0.9.0",
  "models": ["BAAI/bge-small-en-v1.5", "cross-encoder/ms-marco-MiniLM-L-6-v2"],
  "pythonStandaloneUrl": "${URL}",
  "pythonStandaloneSha256": "${SHA}",
  "treeSha256": "${TREE_SHA}"
}
EOF
    echo "[bundle-hindsight] wrote pin $PIN treeSha256=$TREE_SHA"
    ;;
  *)
    echo "[bundle-hindsight] DEST=$DEST is not packaging tree; skipping hindsight-pin.json"
    ;;
esac

echo "[bundle-hindsight] done at $DEST"
