# Troubleshooting Guide

## Services not healthy

- Run `docker compose ps`
- Check API logs: `docker compose logs api`
- Check web logs: `docker compose logs web`
- Check DB readiness: `docker compose logs postgres`

## Migration issues

- Confirm `DATABASE_URL` points to expected host
- Re-run `docker compose run --rm api pnpm prisma:migrate`

## Connectivity issues

- Ensure Caddy, API, and web services are in `up` state
- Verify `PUBLIC_DOMAIN` and reverse proxy routing
