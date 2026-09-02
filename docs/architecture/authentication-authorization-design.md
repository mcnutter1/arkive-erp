# Authentication and Authorization Design

## Authentication

Primary provider: Microsoft Entra ID via OIDC Authorization Code + PKCE.

Server-side controls:

- Validate issuer, audience, nonce, state, token expiry
- Restrict to allowed Entra tenants and configured domains
- Map Microsoft object ID to internal User and Person
- Support optional JIT user creation
- Support invitation and activation flow
- Emit audit events for login and token/session events

External stakeholders:

- Strategy A: Entra B2B/External ID
- Strategy B: expiring signed magic links
- External access must be record-scoped and deny-by-default

## Authorization

Enforcement stack:

- RBAC with system and custom roles
- Permission groups by module action (create/read/update/archive/approve/export)
- Record-level policy checks on every sensitive read/write endpoint
- Field-level masking for sensitive attributes
- Temporary access grants with explicit expiration
- Super-admin impersonation with mandatory reason and extra audit signal

## Non-functional controls

- Server-side policy checks only; UI hiding is never sufficient
- Correlation IDs on every request
- Consistent error envelope without leaking policy internals
- Access-denied events logged for alerting and analysis
