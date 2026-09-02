# Architecture Overview

Arkive Operations Platform is designed as a modular monolith that centralizes identity, people operations, contracts, equity, fundraising, and governance workflows.

## Guiding decisions

- Shared canonical Person identity across all domains
- Organization and legal-entity scoping built into data model
- Immutable ledger for authoritative equity and cap-table state
- Strong auditability and deny-by-default authorization
- Background job orchestration for external integrations

## Runtime layers

- Presentation: Next.js web portal and role-based dashboards
- API: NestJS module-oriented backend with versioned contracts
- Jobs: BullMQ workers for provisioning, signatures, notifications, reconciliation
- Data: PostgreSQL transactional store + S3-compatible object storage

## Extension strategy

New ERP capabilities should be added as bounded modules with explicit APIs and policy enforcement points, avoiding direct cross-domain table writes.
