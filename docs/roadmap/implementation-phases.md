# Phase-by-Phase Implementation Plan

## Phase 0 (current)

- Monorepo scaffolding and strict TypeScript baseline
- Docker Compose infra (PostgreSQL, Redis, MinIO, API, worker, web, Caddy)
- Initial Prisma schema + seed
- Health endpoints, OpenAPI scaffolding
- Foundation docs + threat model + operational scripts

## Phase 1

- Entra OIDC SSO and token/session lifecycle
- Internal user mapping to canonical Person
- RBAC and record-level authorization middleware/guards
- Audit framework and external access foundation

## Phase 2

- People profile and engagement module
- Onboarding/offboarding workflows and tasks
- Directory, org chart, imports/exports

## Phase 3

- Microsoft Graph integration and provisioning workflows
- Queue-backed retries, dry-run, reconciliation view
- Deprovisioning workflow with explicit destructive-step approvals

## Phase 4

- Document repository, versioning, retention, legal hold
- Template engine and PDF generation snapshots
- E-sign provider adapter and webhook evidence pipeline

## Phase 5

- Equity ledger domain and immutable transaction processing
- Cap-table ownership, fully diluted views, as-of history
- Invariant checks, reporting exports, audit packages

## Phase 6

- Option/founder/restricted stock grants
- Vesting engine and termination/exercise workflows
- Board approval workflows and stakeholder equity portal

## Phase 7

- SAFEs, notes, warrants, priced rounds
- Scenario modeling and valuation module
- Investor portal and data-room sharing

## Phase 8

- Security hardening, performance, accessibility
- Backup/restore testing, DR runbook validation
- Production monitoring and release hardening
