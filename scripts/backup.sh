#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

DATA_ROOT="${ARKIVE_DATA_ROOT:-/opt/arkive}"
BACKUP_DIR="$DATA_ROOT/backups"
TARGET="$BACKUP_DIR/arkive-$TS"

mkdir -p "$TARGET"
chmod 700 "$BACKUP_DIR"

echo "[backup] postgres"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TARGET/postgres.sql"

echo "[backup] object storage"
docker compose exec -T minio sh -c "tar czf - /data" > "$TARGET/minio-data.tar.gz"

echo "[backup] config"
cp "$ROOT_DIR/.env" "$TARGET/env.backup"

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$TARGET" && sha256sum * > SHA256SUMS)
fi

echo "[backup] complete: $TARGET"
