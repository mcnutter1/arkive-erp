#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_TAG="${1:-}"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -z "$TARGET_TAG" ]]; then
  echo "Usage: scripts/rollback.sh <tag>" >&2
  exit 1
fi

cd "$ROOT_DIR"
git checkout --detach "$TARGET_TAG"
docker compose up -d --build
scripts/health-check.sh

echo "Rollback complete to $TARGET_TAG"
echo "Note: database schema rollback may require a manual restore if migrations were destructive."
