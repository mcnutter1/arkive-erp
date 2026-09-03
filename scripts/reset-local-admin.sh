#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Missing .env. Run scripts/install.sh first." >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ROOT_DIR/.env"
set +a

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required." >&2
  exit 1
fi

ADMIN_USERNAME="${AUTH_LOCAL_ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${AUTH_LOCAL_ADMIN_PASSWORD:-admin}"
ADMIN_EMAIL="${AUTH_LOCAL_ADMIN_EMAIL:-admin@local.arkive}"

if [[ "${AUTH_LOCAL_LOGIN_ENABLED:-true}" != "true" ]]; then
  echo "AUTH_LOCAL_LOGIN_ENABLED is not true in .env. Enable it before using local login." >&2
  exit 1
fi

echo "Resetting local admin credentials to .env defaults for next login..."

docker compose run --rm api node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const org = await prisma.organization.findFirst({
    where: { archivedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  if (!org) {
    throw new Error('No active organization found');
  }

  await prisma.systemSetting.deleteMany({
    where: {
      organizationId: org.id,
      section: 'auth',
      key: 'localAdmin',
    },
  });

  // Ensure a local admin user can be attached to the new local session.
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: '${ADMIN_EMAIL}' } },
    update: { status: 'ACTIVE', archivedAt: null },
    create: {
      organizationId: org.id,
      email: '${ADMIN_EMAIL}',
      status: 'ACTIVE',
    },
  });

  console.log('Local admin settings reset for organization', org.id);
})();

prisma.$disconnect().catch(() => undefined);
"

echo "Done. Local login uses username=${ADMIN_USERNAME} password=${ADMIN_PASSWORD}"
echo "If containers are not running yet, start them: docker compose up -d api web caddy"
