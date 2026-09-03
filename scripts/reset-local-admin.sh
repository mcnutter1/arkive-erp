#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env. Run scripts/install.sh first." >&2
  exit 1
fi

set_env_var() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ROOT_DIR/.env"; then
    sed "s|^${key}=.*|${key}=${value}|" "$ROOT_DIR/.env" > "$tmp"
  else
    cat "$ROOT_DIR/.env" > "$tmp"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp"
  fi
  mv "$tmp" "$ROOT_DIR/.env"
}

# shellcheck source=/dev/null
set -a
source "$ROOT_DIR/.env"
set +a

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

ADMIN_USERNAME="${1:-admin}"
ADMIN_PASSWORD="${2:-admin}"
ADMIN_EMAIL="${3:-admin@local.arkive}"

# Force local auth config to match the reset credentials so login behavior is deterministic.
set_env_var "AUTH_LOCAL_LOGIN_ENABLED" "true"
set_env_var "AUTH_LOCAL_ADMIN_USERNAME" "$ADMIN_USERNAME"
set_env_var "AUTH_LOCAL_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
set_env_var "AUTH_LOCAL_ADMIN_EMAIL" "$ADMIN_EMAIL"

# Reload env with forced values.
set -a
source "$ROOT_DIR/.env"
set +a

echo "Resetting local admin credentials to .env defaults for next login..."

echo "Ensuring database schema is up to date..."
if ! docker compose run --rm api ./node_modules/.bin/prisma migrate deploy; then
  echo "Failed to apply migrations. Run scripts/install.sh, verify database connectivity, then retry." >&2
  exit 1
fi

docker compose run --rm \
  -e RESET_ADMIN_USERNAME="$ADMIN_USERNAME" \
  -e RESET_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  -e RESET_ADMIN_EMAIL="$ADMIN_EMAIL" \
  api node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('crypto');

async function main() {
  const prisma = new PrismaClient();

  try {
    let org = await prisma.organization.findFirst({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: {
          code: 'default',
          name: 'Default Organization',
        },
      });
    }

    const adminUsername = process.env.RESET_ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.RESET_ADMIN_PASSWORD || 'admin';
    const adminEmail = process.env.RESET_ADMIN_EMAIL || 'admin@local.arkive';
    const salt = randomBytes(16).toString('hex');
    const passwordHash = scryptSync(adminPassword, salt, 64).toString('hex');

    await prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId: org.id,
          section: 'auth',
          key: 'localAdmin',
        },
      },
      update: {
        value: {
          username: adminUsername,
          email: adminEmail,
          passwordHash,
          passwordSalt: salt,
          rotatedAt: new Date().toISOString(),
        },
        updatedByUserId: null,
      },
      create: {
        organizationId: org.id,
        section: 'auth',
        key: 'localAdmin',
        value: {
          username: adminUsername,
          email: adminEmail,
          passwordHash,
          passwordSalt: salt,
          rotatedAt: new Date().toISOString(),
        },
        updatedByUserId: null,
      },
    });

    // Ensure a local admin user can be attached to the new local session.
    await prisma.user.upsert({
      where: { organizationId_email: { organizationId: org.id, email: adminEmail } },
      update: { status: 'ACTIVE', archivedAt: null },
      create: {
        organizationId: org.id,
        email: adminEmail,
        status: 'ACTIVE',
      },
    });

    console.log('Local admin settings reset for organization', org.id);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE

echo "Done. Local login uses username=${ADMIN_USERNAME} password=${ADMIN_PASSWORD}"
echo "Recreating API and Web containers to pick up auth env changes..."
docker compose up -d --force-recreate --no-deps api web caddy
echo "If login still fails, inspect logs: docker compose logs --tail=120 api"
