#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/data/runtime/deploy.lock"

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

git fetch origin --prune

if BRANCH_NAME="$(git symbolic-ref --quiet --short HEAD 2>/dev/null)"; then
  :
else
  BRANCH_NAME="${UPDATE_BRANCH:-$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')}"
  if [[ -z "$BRANCH_NAME" ]]; then
    echo "Unable to determine target branch. Set UPDATE_BRANCH and retry." >&2
    exit 1
  fi
  git checkout "$BRANCH_NAME"
fi

git pull --ff-only origin "$BRANCH_NAME"

echo "Pending migrations (if any):"
docker compose run --rm api ./node_modules/.bin/prisma migrate status || true

# Update only application-facing services; do not rerun full install behavior.
docker compose up -d --no-deps --build api worker web caddy
docker compose run --rm api ./node_modules/.bin/prisma migrate deploy

scripts/health-check.sh

DEPLOY_SHA="$(git rev-parse --short HEAD)"
echo "$BRANCH_NAME@$DEPLOY_SHA $(date -u +%FT%TZ) success" >> "$ROOT_DIR/data/runtime/deploy-history.log"
echo "Update complete: $BRANCH_NAME@$DEPLOY_SHA"
