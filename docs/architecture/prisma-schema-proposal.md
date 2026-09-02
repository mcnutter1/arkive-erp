# Prisma Schema Proposal

## Design goals

- UUID primary keys everywhere.
- Organization scoping in all tenant-bound tables.
- Immutable audit stream for sensitive actions.
- Extensible baseline schema supporting later domain modules.

## Implemented in Phase 0

Current schema in `apps/api/prisma/schema.prisma` includes:

- `Organization`
- `LegalEntity`
- `Person`
- `User`
- `Role`
- `Permission`
- `RolePermission`
- `UserRole`
- `AuditEvent`
- `FeatureFlag`
- `Department`
- `EngagementType`

## Planned additions by phase

- Phase 1: session records, external identities, record-level policy grants
- Phase 2: engagements, tasks, onboarding/offboarding templates, org chart references
- Phase 3: M365 account lifecycle and reconciliation snapshots
- Phase 4: document blobs, versions, template snapshots, signature evidence
- Phase 5-7: full equity ledger, vesting engine tables, fundraising and valuations
- Phase 8: backup registry, retention policy execution metadata

## Constraint strategy

- Composite uniqueness for tenant-aware keys.
- FK constraints with restrictive delete behavior for core entities.
- Check constraints for non-negative quantities and valid status transitions (via SQL migrations where needed).
- Materialized views for reporting (planned once ledger tables exist).
