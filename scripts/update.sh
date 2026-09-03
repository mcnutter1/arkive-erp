#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="${ARKIVE_GIT_REPO_URL:-https://github.com/mcnutter1/arkive-erp.git}"
CANONICAL_ROOT="${ARKIVE_CANONICAL_ROOT:-/opt/arkive}"

if [[ "${FORCE_UPDATE_IN_PLACE:-false}" != "true" ]] && [[ "$ROOT_DIR" != "$CANONICAL_ROOT" ]] && [[ -x "$CANONICAL_ROOT/scripts/update.sh" ]]; then
  echo "[update] rerouting update execution to $CANONICAL_ROOT"
  exec "$CANONICAL_ROOT/scripts/update.sh" "$@"
fi

apply_database_schema() {
  echo "Ensuring database schema..."

  if [[ -d "$ROOT_DIR/apps/api/prisma/migrations" ]] && find "$ROOT_DIR/apps/api/prisma/migrations" -mindepth 1 -maxdepth 1 -type d | grep -q .; then
    docker compose run --rm api ./node_modules/.bin/prisma migrate deploy
  else
    echo "No prisma migrations found; applying schema with prisma db push"
    docker compose run --rm api ./node_modules/.bin/prisma db push --skip-generate
  fi
}

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

DATA_ROOT="${ARKIVE_DATA_ROOT:-/opt/arkive}"
LOCK_FILE="$DATA_ROOT/runtime/deploy.lock"
CURRENT_COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-arkive-erp}"
PROJECT_GUARD_FILE="$DATA_ROOT/runtime/compose-project-name"

if ! command -v git >/dev/null 2>&1; then
  echo "Missing required command: git" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[update] no git metadata found at $ROOT_DIR; bootstrapping repository"
  git init
fi

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

AUTO_STASH_DIRTY_DEPLOY="${AUTO_STASH_DIRTY_DEPLOY:-true}"
STASH_REF=""

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if [[ -n "$(git status --porcelain)" ]]; then
    if [[ "${ALLOW_DIRTY_DEPLOY:-false}" == "true" ]]; then
      echo "[update] continuing with dirty working tree (ALLOW_DIRTY_DEPLOY=true)"
    elif [[ "$AUTO_STASH_DIRTY_DEPLOY" == "true" ]]; then
      echo "[update] stashing local changes before pulling latest code"
      git stash push -u -m "arkive-auto-stash-$(date -u +%FT%TZ)" >/dev/null || true
      STASH_REF="$(git stash list | head -n 1 | cut -d: -f1 || true)"
      if [[ -n "$(git status --porcelain)" ]]; then
        echo "Working tree still has uncommitted changes after auto-stash." >&2
        echo "Resolve manually or set ALLOW_DIRTY_DEPLOY=true to force." >&2
        exit 1
      fi
      if [[ -n "$STASH_REF" ]]; then
        echo "[update] local changes saved as $STASH_REF"
      fi
    else
      echo "Working tree has uncommitted changes. Set ALLOW_DIRTY_DEPLOY=true or AUTO_STASH_DIRTY_DEPLOY=true." >&2
      exit 1
    fi
  fi
fi

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is in progress." >&2
  exit 1
fi

if [[ -f "$PROJECT_GUARD_FILE" ]]; then
  PREVIOUS_COMPOSE_PROJECT="$(tr -d '[:space:]' < "$PROJECT_GUARD_FILE")"
  if [[ -n "$PREVIOUS_COMPOSE_PROJECT" && "$PREVIOUS_COMPOSE_PROJECT" != "$CURRENT_COMPOSE_PROJECT" ]]; then
    echo "COMPOSE_PROJECT_NAME changed since last successful deploy." >&2
    echo "Previous: $PREVIOUS_COMPOSE_PROJECT" >&2
    echo "Current:  $CURRENT_COMPOSE_PROJECT" >&2
    echo "Aborting to prevent accidental volume namespace switch and data split." >&2
    echo "If intentional, set COMPOSE_PROJECT_NAME back, migrate data manually, then rerun." >&2
    exit 1
  fi
fi

avail_kb=$(df -k "$DATA_ROOT" | awk 'NR==2 {print $4}')
if [[ "${avail_kb:-0}" -lt 2097152 ]]; then
  echo "Insufficient disk space: need at least 2 GB free." >&2
  exit 1
fi

scripts/backup.sh

git fetch origin --prune

BRANCH_NAME="${UPDATE_BRANCH:-}"
if [[ -z "$BRANCH_NAME" ]]; then
  BRANCH_NAME="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
fi
if [[ -z "$BRANCH_NAME" ]]; then
  BRANCH_NAME="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
fi
if [[ -z "$BRANCH_NAME" ]]; then
  BRANCH_NAME="$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ {sub("refs/heads/", "", $2); print $2; exit}')"
fi
if [[ -z "$BRANCH_NAME" ]]; then
  echo "Unable to determine target branch. Set UPDATE_BRANCH and retry." >&2
  exit 1
fi

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if ! git checkout "$BRANCH_NAME"; then
    echo "[update] local branch not available; recreating from origin/$BRANCH_NAME"
    git checkout -f -B "$BRANCH_NAME" "origin/$BRANCH_NAME"
  fi
else
  if ! git checkout -b "$BRANCH_NAME" --track "origin/$BRANCH_NAME"; then
    echo "[update] standard branch checkout failed; forcing sync from origin/$BRANCH_NAME"
    git checkout -f -B "$BRANCH_NAME" "origin/$BRANCH_NAME"
  fi
fi

git pull --ff-only origin "$BRANCH_NAME"

echo "Pending migrations (if any):"
docker compose run --rm api ./node_modules/.bin/prisma migrate status || true

# Update only application-facing services; do not rerun full install behavior.
docker compose up -d --no-deps --build api worker web caddy
apply_database_schema

scripts/health-check.sh

DEPLOY_SHA="$(git rev-parse --short HEAD)"
echo "$BRANCH_NAME@$DEPLOY_SHA $(date -u +%FT%TZ) success" >> "$DATA_ROOT/runtime/deploy-history.log"
printf '%s\n' "$CURRENT_COMPOSE_PROJECT" > "$PROJECT_GUARD_FILE"
echo "Update complete: $BRANCH_NAME@$DEPLOY_SHA"
