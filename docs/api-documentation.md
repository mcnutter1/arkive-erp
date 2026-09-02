# API Documentation

- Base path: `/api/v1`
- OpenAPI UI: `/docs`
- Health endpoints:
  - `/health/liveness`
  - `/health/readiness`

Implemented v1 endpoints:

- `GET /api/v1/auth/login`
- `GET /api/v1/auth/callback`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET /api/v1/system/me`
- `GET /api/v1/people`
- `POST /api/v1/people`
- `POST /api/v1/people/engagements`
- `POST /api/v1/documents`
- `POST /api/v1/documents/upload-url`
- `POST /api/v1/documents/:documentId/versions`
- `GET /api/v1/documents/versions/:documentVersionId/download-url`
- `POST /api/v1/signatures/requests`
- `GET /api/v1/signatures/my-requests`
- `POST /api/v1/signatures/participants/:participantId/sign`
- `POST /api/v1/signatures/participants/:participantId/decline`
- `GET /api/v1/equity/ledger`
- `POST /api/v1/equity/ledger`
- `GET /api/v1/vesting/grants/:grantId/preview`
- `POST /api/v1/equity/lifecycle/terminations`
- `POST /api/v1/equity/lifecycle/exercise-requests`
- `POST /api/v1/equity/lifecycle/exercise-requests/:requestId/approve`
- `POST /api/v1/equity/lifecycle/exercise-requests/:requestId/decline`
- `POST /api/v1/equity/lifecycle/exercise-requests/:requestId/cancel`
- `POST /api/v1/equity/lifecycle/exercise-requests/:requestId/complete`
- `GET /api/v1/fundraising/rounds`
- `POST /api/v1/fundraising/rounds`
- `GET /api/v1/fundraising/scenarios/:roundId`
- `POST /api/v1/fundraising/scenarios/:roundId`
- `POST /api/v1/fundraising/scenarios/:roundId/:scenarioId/simulate`
- `GET /api/v1/valuations`
- `POST /api/v1/valuations`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/my-notifications`
- `GET /api/v1/approvals/requests`
- `POST /api/v1/approvals/requests`
- `POST /api/v1/approvals/requests/:approvalId/decide`
- `GET /api/v1/m365/jobs`
- `POST /api/v1/m365/jobs`
- `GET /api/v1/portal/me`
- `GET /api/v1/admin/settings/:section`
- `POST /api/v1/admin/settings`
- `GET /api/v1/search/global?q=`
- `GET /api/v1/search/timeline/:targetType/:targetId`
- `POST /api/v1/access/shares`
- `GET /api/v1/reports/cap-table-summary`
- `GET /api/v1/reports/people-roster.csv`
- `GET /api/v1/reports/equity-ledger.csv`

Planned API standards:

- DTO validation
- Consistent error envelope
- Pagination, filtering, sorting
- Idempotency keys for sensitive writes
- Correlation IDs
- Server-side authorization guards
