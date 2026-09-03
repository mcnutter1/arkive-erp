# End-to-End Wiring Analysis

Date: 2026-09-02

## Scope

This analysis checks whether each implemented module has a complete usable path:

1. Web route available in authenticated shell
2. API endpoint(s) callable with current auth/session setup
3. Data persistence path to Postgres via Prisma
4. Any major gaps that still block production readiness

## Domain Matrix

| Domain | Web Route | API Coverage | Persistence | Status |
|---|---|---|---|---|
| Authentication | `/`, `/app`, `/app/setup-security` | `/auth/login`, `/auth/callback`, `/auth/local-login`, `/auth/local-admin/password`, `/auth/session`, `/auth/logout` | `auth_session`, `oidc_auth_state`, `system_setting` | Functional bootstrap; partial hardening |
| People | `/app/people` | `GET/POST /people`, `POST /people/engagements` | `person`, `engagement` | End-to-end basic |
| Tasks | `/app/tasks` | `GET/POST /tasks`, `GET /tasks/my-notifications` | `task`, `notification` | End-to-end basic |
| Documents | `/app/documents` | `GET/POST /documents`, `POST /documents/upload-url`, `POST /documents/:id/versions`, `GET /documents/:id/versions`, `GET /documents/versions/:versionId/download-url` | `document`, `document_version`, object storage | End-to-end basic |
| Equity Ledger | `/app/equity` | `GET/POST /equity/ledger`, vesting and lifecycle endpoints available in API | `equity_transaction`, `vesting_schedule`, `exercise_request`, `termination_record` | End-to-end operator path exists; domain depth partial |
| Fundraising | `/app/fundraising` | `GET/POST /fundraising/rounds`, scenario list/create/simulate | `fundraising_round`, `fundraising_scenario` | End-to-end basic |
| Valuations + Reports | `/app/valuations-reports` | `GET/POST /valuations`, `GET /reports/cap-table-summary`, CSV exports | `valuation`, `equity_transaction`, `person` | End-to-end basic |
| Approvals | `/app/approvals` | `GET/POST /approvals/requests`, decision endpoint | `approval_request`, `approval_decision` | End-to-end basic |
| M365 Jobs | `/app/m365` | `GET/POST /m365/jobs` | `m365_provisioning_job`, queue | Queue-backed; Graph integration partial |
| Portal | `/app/portal` | `GET /portal/me` | joins across person, engagements, signatures, tasks, grants | End-to-end basic |
| Search + Timeline | `/app/search` | `GET /search/global`, `GET /search/timeline/:type/:id` | cross-model query + `audit_event` | End-to-end basic |
| Admin Settings | `/app/admin-settings` | `GET /admin/settings/:section`, `POST /admin/settings` | `system_setting` | End-to-end basic |

## What Is Now Wired Correctly

- Reverse proxy is present and starts independently (`caddy` service, Caddyfile domain routing).
- API and web health probes are container-binary independent (Node `fetch` checks).
- Installer does not depend on interactive pnpm execution for migrations/seeding.
- Auth bootstrap path is present: local admin login + first-run password rotation flow.
- App shell now links to core operational routes rather than a placeholder-only page.

## Remaining Gaps To Full Spec Completion

### Security and Identity

- Entra Authorization Code + PKCE depth and UX refinement not complete.
- External stakeholder auth mode (B2B/magic link) not complete.
- Field-level masking and complete record-level policy matrix not complete.
- Session lifecycle hardening (device/session management UX, revocation ops) is partial.

### Domain Depth

- Equity invariants and immutable ledger guarantees are foundational, not fully exhaustive.
- Vesting and lifecycle governance controls are partial.
- Document legal hold/retention/malware controls and immutable evidence bundles are partial.
- Fundraising instruments and valuation controls are partial.
- M365 queue processors are foundational; Microsoft Graph full lifecycle/reconciliation is partial.

### Quality and Operations

- End-to-end automated tests across modules are incomplete.
- Backup verification and isolated restore drills are not fully automated.
- Security/compliance hardening and performance pass are incomplete.

## Recommended Next Completion Order

1. Add e2e integration tests for login, people, tasks, documents, fundraising, valuations, reports.
2. Complete equity invariants and lifecycle policy checks with test coverage.
3. Complete document retention/legal hold/evidence pipeline.
4. Implement M365 Graph provisioning and reconciliation execution paths.
5. Add production observability and DR verification automation.

## Deployment Verification Checklist

1. `docker compose up -d --build --force-recreate`
2. Confirm `api`, `web`, and `caddy` are healthy/running in `docker compose ps`
3. Log in at `/` with local admin (or Entra)
4. Rotate default local password at `/app/setup-security`
5. Execute workflow smoke tests:
   - `/app/people` create + list
   - `/app/tasks` create + list
   - `/app/documents` create + upload + finalize + download URL
   - `/app/fundraising` create round + scenario + simulate
   - `/app/valuations-reports` create valuation + export CSV

This checklist confirms cross-service wiring from web -> API -> DB/object storage/queue for the implemented breadth.
