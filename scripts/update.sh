#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/data/runtime/deploy.lock"
TAG="${1:-}"

if [[ -z "$TAG" ]]; then
  echo "Usage: scripts/update.sh <release-tag>" >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env. Run scripts/install.sh once before using update.sh." >&2
  exit 1
fi

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -n "$(git status --porcelain)" && "${ALLOW_DIRTY_DEPLOY:-false}" != "true" ]]; then
  echo "Working tree has uncommitted changes. Set ALLOW_DIRTY_DEPLOY=true to override." >&2
  exit 1
fi

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is in progress." >&2
  exit 1
fi

avail_kb=$(df -k "$ROOT_DIR" | awk 'NR==2 {print $4}')
if [[ "${avail_kb:-0}" -lt 2097152 ]]; then
  echo "Insufficient disk space: need at least 2 GB free." >&2
  exit 1
fi

scripts/backup.sh

git fetch --tags
git checkout --detach "$TAG"

echo "Pending migrations (if any):"
docker compose run --rm api pnpm exec prisma migrate status || true

# Update only application-facing services; do not rerun full install behavior.
docker compose up -d --no-deps --build api worker web caddy
docker compose run --rm api pnpm prisma:migrate

scripts/health-check.sh

echo "$TAG $(date -u +%FT%TZ) success" >> "$ROOT_DIR/data/runtime/deploy-history.log"
echo "Update complete: $TAG"
