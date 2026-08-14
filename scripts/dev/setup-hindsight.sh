#!/bin/sh
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export DEST="${DEST:-$HOME/.openbot/hindsight}"
exec "$ROOT/scripts/dev/bundle-hindsight.sh"
