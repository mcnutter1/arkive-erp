# Local Development Guide

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Engine with Compose plugin

## Quick start

1. `cp .env.example .env`
2. `corepack enable`
3. `pnpm install`
4. `docker compose up -d --build`
5. `docker compose run --rm api pnpm prisma:migrate`
6. `docker compose run --rm api pnpm prisma:seed`

## Useful commands

- `pnpm dev`
- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `docker compose logs -f api`

## Security notes

- Never commit `.env`.
- Do not print or log token/secret values.
