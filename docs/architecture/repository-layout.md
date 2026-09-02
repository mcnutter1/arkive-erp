# Repository Layout

## Top-level structure

- `apps/api`: NestJS backend and Prisma
- `apps/web`: Next.js frontend
- `apps/worker`: BullMQ workers and reconciliation jobs
- `packages/config`: shared configuration schemas and env parsing
- `packages/types`: shared strict types and domain value objects
- `packages/ui`: shared component primitives
- `docs`: architecture, security, operational docs
- `scripts`: installation, upgrade, backup, restore, rollback
- `infra`: reverse proxy and deployment assets

## Module boundaries inside API

Planned modules:

- identity-access
- organizations
- people-stakeholders
- engagements
- m365-provisioning
- documents-contracts
- e-signatures
- equity-ledger
- securities-plans
- vesting
- board-approvals
- fundraising
- valuations
- notifications
- reporting
- audit-compliance
- system-admin
- integrations

Each module will expose services and REST contracts; cross-module writes must use service APIs, not direct table mutation in other domains.
