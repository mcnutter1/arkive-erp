#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
docker compose ps

echo "[health] api"
docker compose exec -T api wget --spider -q http://localhost:4000/api/v1/health/liveness

echo "[health] web"
docker compose exec -T web wget --spider -q http://localhost:3000

echo "[health] done"
