#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-90}"
HEALTH_POLL_INTERVAL_SECONDS="${HEALTH_POLL_INTERVAL_SECONDS:-3}"

wait_for_service_running() {
	local service="$1"
	local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))

	while (( SECONDS < deadline )); do
		local container_id
		container_id="$(docker compose ps -q "$service" 2>/dev/null || true)"

		if [[ -n "$container_id" ]]; then
			local status
			status="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
			if [[ "$status" == "running" ]]; then
				return 0
			fi
		fi

		sleep "$HEALTH_POLL_INTERVAL_SECONDS"
	done

	echo "[health] service '$service' did not reach running state within ${HEALTH_TIMEOUT_SECONDS}s" >&2
	docker compose ps "$service" || true
	echo "[health] recent logs for '$service'" >&2
	docker compose logs --tail=150 "$service" || true
	return 1
}

run_service_probe() {
	local service="$1"
	local probe_script="$2"

	wait_for_service_running "$service"

	if ! docker compose exec -T "$service" node -e "$probe_script"; then
		echo "[health] probe failed for '$service'" >&2
		echo "[health] recent logs for '$service'" >&2
		docker compose logs --tail=150 "$service" || true
		return 1
	fi
}

cd "$ROOT_DIR"
docker compose ps

echo "[health] api"
run_service_probe api "fetch('http://localhost:4000/api/v1/health/liveness').then((r)=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"

echo "[health] web"
run_service_probe web "fetch('http://localhost:3000').then((r)=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"

echo "[health] done"
