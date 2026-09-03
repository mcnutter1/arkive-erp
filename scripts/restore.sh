#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_PATH="${1:-}"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -z "$BACKUP_PATH" || ! -d "$BACKUP_PATH" ]]; then
  echo "Usage: scripts/restore.sh <backup-directory>" >&2
  exit 1
fi

echo "[restore] stopping app services"
docker compose stop api web worker

echo "[restore] restoring postgres"
cat "$BACKUP_PATH/postgres.sql" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "[restore] restoring object storage"
MINIO_CONTAINER_ID="$(docker compose ps -q minio)"
if [[ -z "$MINIO_CONTAINER_ID" ]]; then
  echo "MinIO container is not running. Start services and retry restore." >&2
  exit 1
fi
docker compose exec -T minio sh -c "rm -rf /data/*"
gzip -dc "$BACKUP_PATH/minio-data.tar.gz" | docker cp - "$MINIO_CONTAINER_ID":/

echo "[restore] restoring .env"
cp "$BACKUP_PATH/env.backup" "$ROOT_DIR/.env"

echo "[restore] starting services"
docker compose up -d api worker web
scripts/health-check.sh

echo "[restore] complete"
