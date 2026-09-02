#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

set_env_var() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed "s|^${key}=.*|${key}=${value}|" "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$ENV_FILE"
}

is_valid_fqdn() {
  local host="$1"
  if [[ "$host" == "localhost" ]]; then
    return 1
  fi
  if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    return 1
  fi
  if [[ "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
    return 0
  fi
  return 1
}

prompt_for_domain_and_acme() {
  local fqdn="${PUBLIC_DOMAIN:-}"
  local email="${ACME_EMAIL:-}"

  while ! is_valid_fqdn "$fqdn"; do
    read -r -p "[install] Enter the public FQDN for this site (example: erp.arkive.com): " fqdn
    fqdn="${fqdn,,}"
    if ! is_valid_fqdn "$fqdn"; then
      echo "[install] A public DNS hostname is required for Let's Encrypt (no localhost or IP)." >&2
    fi
  done

  while [[ -z "$email" || "$email" == "ops@example.com" ]]; do
    read -r -p "[install] Enter ACME contact email for Let's Encrypt notices: " email
    if [[ -z "$email" ]]; then
      echo "[install] ACME email is required." >&2
    fi
  done

  set_env_var "PUBLIC_DOMAIN" "$fqdn"
  set_env_var "ACME_EMAIL" "$email"
  set_env_var "APP_BASE_URL" "https://$fqdn"
  set_env_var "API_CORS_ORIGIN" "https://$fqdn"
  set_env_var "NEXT_PUBLIC_API_BASE_URL" "https://$fqdn/api/v1"
  set_env_var "ENTRA_REDIRECT_URI" "https://$fqdn/api/v1/auth/callback"

  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a

  echo "[install] configured PUBLIC_DOMAIN=$PUBLIC_DOMAIN"
}

wait_for_letsencrypt_cert() {
  local domain="$1"
  local attempts=30
  local i=1

  echo "[install] waiting for Let's Encrypt certificate issuance for $domain"
  while [[ "$i" -le "$attempts" ]]; do
    if docker compose exec -T caddy sh -lc "find /data/caddy/certificates -type f -name '*.crt' | grep -E '/${domain}/' >/dev/null"; then
      echo "[install] Let's Encrypt certificate detected for $domain"
      return 0
    fi
    echo "[install] certificate not ready yet ($i/$attempts)"
    i=$((i + 1))
    sleep 5
  done

  echo "[install] certificate was not detected in time. Check DNS/ports and Caddy logs:" >&2
  docker compose logs --tail=80 caddy || true
  return 1
}

echo "[install] validating host OS"
if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    echo "This script targets Ubuntu 26.04 LTS. Current ID=${ID:-unknown}." >&2
    exit 1
  fi
fi

require_cmd docker
require_cmd openssl

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/data/backups" "$ROOT_DIR/data/runtime"
chmod 700 "$ROOT_DIR/data/backups"

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "[install] created .env from template"
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi

prompt_for_domain_and_acme

gen_secret() {
  openssl rand -hex 32
}

if ! grep -q '^COOKIE_SECRET=' "$ENV_FILE" || grep -q '^COOKIE_SECRET=change-me' "$ENV_FILE"; then
  tmp="$(mktemp)"
  sed "s|^COOKIE_SECRET=.*|COOKIE_SECRET=$(gen_secret)|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
fi

if ! grep -q '^ENCRYPTION_KEY=' "$ENV_FILE" || grep -q '^ENCRYPTION_KEY=32-byte-key-placeholder' "$ENV_FILE"; then
  tmp="$(mktemp)"
  sed "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$(gen_secret)|" "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
fi

echo "[install] building and starting services"
cd "$ROOT_DIR"
docker compose pull || true
docker compose up -d --build

wait_for_letsencrypt_cert "$PUBLIC_DOMAIN"

echo "[install] waiting for health checks"
docker compose ps

echo "[install] running migrations"
docker compose run --rm api pnpm prisma:migrate

echo "[install] optional seed"
if [[ "${SEED_ON_INSTALL:-false}" == "true" ]]; then
  docker compose run --rm api pnpm prisma:seed
fi

echo "[install] complete"
echo "App URL: https://$PUBLIC_DOMAIN"
echo "Next: configure Microsoft Entra app registration and callback URLs."
