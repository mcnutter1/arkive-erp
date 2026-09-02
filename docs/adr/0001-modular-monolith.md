# ADR 0001: Modular Monolith Foundation

## Status
Accepted

## Context
Arkive requires an internal ERP platform that spans identity, people operations, Microsoft 365 lifecycle, contracts, equity, fundraising, and compliance. The product scope is broad and deeply connected through a single canonical person/stakeholder identity model.

## Decision
Build as a modular monolith in a single TypeScript monorepo using pnpm and Turborepo.

- Frontend: Next.js App Router
- Backend: NestJS with versioned REST (`/api/v1`) and OpenAPI
- Data: PostgreSQL + Prisma migrations
- Async jobs: Redis + BullMQ
- Object storage: S3-compatible (MinIO supported)
- AuthN: Microsoft Entra OIDC/OAuth2
- AuthZ: RBAC + record-level policy checks with deny-by-default

## Rationale

- Shared identity and ledger consistency are easier to enforce in-process.
- Team can ship faster with explicit module boundaries before service extraction.
- Operational complexity is significantly lower than microservices at this stage.
- Phase-based delivery can harden modules without redesigning deployment topology.

## Consequences

- Strong module contracts are mandatory to prevent hidden coupling.
- Database governance and migration discipline are critical.
- Observability and audit consistency can be standardized once and reused.

## Follow-up ADRs

- Identity provider fallback strategy for external users
- Signature-provider selection
- Backup encryption and off-site retention policy
- Record-level policy engine implementation details
