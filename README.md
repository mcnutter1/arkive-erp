# Arkive Operations Platform

Production-oriented ERP foundation for Arkive, implemented as a modular monolith in a pnpm + Turborepo workspace.

## Current status

This repository currently contains Phase 0 scaffolding:

- Monorepo layout (`apps/*`, `packages/*`, `docs/*`, `scripts/*`)
- NestJS API baseline with versioned API prefix and OpenAPI
- Next.js App Router baseline
- Redis/BullMQ worker baseline
- PostgreSQL/Redis/MinIO/Caddy Docker Compose stack
- Prisma schema foundation and seed data
- Operations scripts for install/update/backup/restore/health/rollback
- Initial CI workflow
- Architecture and security documentation package

## Repository map

- `apps/api`: NestJS API, Prisma schema, seed scripts
- `apps/web`: Next.js frontend
- `apps/worker`: background jobs and queue processors
- `packages/config`: shared runtime config parsing
- `packages/types`: shared strict TypeScript types
- `packages/ui`: shared UI primitives/utilities (starter)
- `docs`: architecture, security, implementation roadmap
- `scripts`: install/update/backup/restore/rollback tooling
- `infra`: reverse proxy configuration

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Engine + Docker Compose plugin

## Local setup

1. Copy environment template:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

3. Start infrastructure and apps:

   ```bash
   docker compose up -d --build
   ```

4. Run database migrations and seed:

   ```bash
   docker compose run --rm api pnpm prisma:migrate
   docker compose run --rm api pnpm prisma:seed
   ```

## Scripts

- `scripts/install.sh`: idempotent bootstrap for Ubuntu 26.04 target; prompts for public FQDN and ACME email, then waits for Let's Encrypt certificate issuance
- `scripts/update.sh <tag>`: guarded release update workflow for app services only (does not rerun full install bootstrap)
- `scripts/backup.sh`: database/config backup
- `scripts/restore.sh <backup-path>`: restore workflow
- `scripts/health-check.sh`: service liveness/readiness checks
- `scripts/rollback.sh <tag>`: app container rollback workflow

## Documentation

See:

- `docs/adr/0001-modular-monolith.md`
- `docs/architecture/*`
- `docs/security/threat-model.md`
- `docs/roadmap/*`
- `docs/roadmap/spec-coverage-status.md`

## Important notes

- Legal, tax, and securities workflows are configurable and require counsel review.
- This system does not provide legal or tax advice.
- Authoritative cap-table state must come from immutable ledger transactions.
