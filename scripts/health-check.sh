#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"
docker compose ps

echo "[health] api"
docker compose exec -T api node -e "fetch('http://localhost:4000/api/v1/health/liveness').then((r)=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"

echo "[health] web"
docker compose exec -T web node -e "fetch('http://localhost:3000').then((r)=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"

echo "[health] done"
