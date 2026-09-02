# Deployment Topology

## Runtime components

- Reverse proxy: Caddy (TLS termination)
- Frontend: Next.js web app
- API: NestJS app
- Worker: BullMQ processors
- Database: PostgreSQL
- Queue/cache: Redis
- Object storage: S3-compatible storage (MinIO for self-hosting)

## Mermaid deployment diagram

```mermaid
flowchart LR
  User((Internal User)) --> Caddy
  External((External Stakeholder)) --> Caddy

  Caddy --> Web[Next.js Web]
  Caddy --> Api[NestJS API]

  Api --> Pg[(PostgreSQL)]
  Api --> Redis[(Redis)]
  Api --> S3[(S3/MinIO)]
  Api --> Graph[Microsoft Graph]
  Api --> Sign[E-sign Provider]

  Worker[Background Worker] --> Redis
  Worker --> Api
  Worker --> Graph
  Worker --> Sign
```

## Security boundaries

- Only reverse-proxy ports are public.
- PostgreSQL, Redis, MinIO admin ports stay private to Docker network.
- Secrets are environment-injected and not returned to browsers.
- Signed short-lived storage URLs are used for downloads.
