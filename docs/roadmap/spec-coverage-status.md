# Spec Coverage Status

Date: 2026-09-02

## Summary

The full ERP specification is not yet complete. The repository now includes a deployable authenticated web shell with working module flows for people, tasks, documents, fundraising scenarios, valuations/reports, approvals, equity ledger entry, M365 jobs, portal summary, search/timeline, and admin settings, plus partial Phase 1 security foundations.

## Completed or partially completed

- Phase 0 monorepo and infra scaffolding: completed
- Basic API versioning and OpenAPI endpoint setup: completed
- Basic health endpoints: completed
- Baseline Prisma core identity schema + seed: partial
- Expanded Prisma domain foundations for engagements, documents, native signatures, tasks, equity, fundraising, valuations, and approvals: partial
- Installer/updater/backup/restore/rollback scripts: partial
- Installer FQDN prompt + Let's Encrypt certificate wait: completed
- Global auth guard, permissions guard, request context, and audit interceptor foundations: partial
- OIDC state/nonce login and callback plus secure session-cookie lifecycle foundation: partial
- Local bootstrap login with first-run password rotation: completed
- Record-level document sharing and access policy enforcement foundation: partial
- Native e-sign request/participant lifecycle API foundation: partial
- People, documents, tasks/notifications, equity ledger, fundraising, and valuations API foundations: partial
- Authenticated web app shell and module navigation: completed
- People workflow (list/create) via web UI + API: completed
- Tasks workflow (list/create) via web UI + API: completed
- Documents workflow (create/upload/finalize/list/download URL) via web UI + API: completed
- Fundraising workflow (rounds/scenarios/simulate) via web UI + API: completed
- Valuations and reporting workflow (list/create/cap-table/CSV exports) via web UI + API: completed
- Approvals workflow (request/decision/list) via web UI + API: completed
- Equity ledger workflow (list/create transaction) via web UI + API: completed
- M365 provisioning jobs workflow (queue/list) via web UI + API: completed
- Portal summary, search/timeline, and admin settings via web UI + API: completed
- Vesting preview engine and grant-based vesting calculations: partial
- Exercise request and termination workflow API foundations: partial
- Exercise request lifecycle transitions (submit/approve/decline/cancel/complete with completion-time ledger write): partial
- Fundraising scenario storage and simulation (isolated from authoritative ledger): partial
- Approval workflow request/decision API foundation: partial
- Microsoft 365 provisioning job queue API foundation: partial
- Stakeholder self-portal summary API foundation: partial
- Administration settings API foundation: partial
- Global search and activity timeline API foundation: partial
- Permission-aware report and CSV export API foundation: partial
- Threat model and architecture docs: completed

## Not complete yet (blocking production go-live)

- Entra login UX and full Authorization Code + PKCE exchange flow
- Session management lifecycle, revocation, JIT onboarding workflow completion
- Record-level authorization policy engine and field-level masking
- External stakeholder access mode implementation (B2B or magic links)
- People and engagement modules
- Microsoft Graph provisioning/deprovisioning workflows and drift reconciliation
- Document storage, versioning, retention, legal hold, malware scan integration
- Template generation and immutable snapshot pipeline
- Native e-sign completion certificates and immutable evidence package exports
- Equity ledger domain model and immutable transaction engine
- Vesting engine and grants lifecycle depth (materialized schedules, pause/resume semantics, acceleration governance)
- Exercise and termination workflows depth (approval lifecycle, window overrides, ledger effects on completion)
- Fundraising instruments and scenario modeling depth
- Valuation module and controls
- Stakeholder portal and role-specific dashboards
- Reports, exports, and audit-ready packages
- Full automated test matrix (unit, integration, e2e, property-based)
- Backup verification and isolated restore test automation
- Security/compliance hardening pass for all modules

## External decisions still required

See `docs/roadmap/decisions-requiring-arkive-approval.md`.

## Deployment readiness verdict

Not production-ready yet.
