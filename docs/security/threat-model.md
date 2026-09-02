# Threat Model (Phase 0)

## Assets

- Identity data and access grants
- Engagement and HR records
- Contracts and signature evidence
- Equity ledger transactions
- Fundraising and valuation documents
- Credentials and integration secrets

## Primary threat categories

- Broken object-level authorization
- Privilege escalation and over-broad role grants
- Token theft/session abuse
- Malicious or oversized file uploads
- Webhook forgery/replay
- Unauthorized data exfiltration via exports
- Supply-chain risks in dependencies/containers
- Backup theft or restore misuse

## Core mitigations in architecture

- Deny-by-default server-side authorization
- RBAC + record-level checks + field-level masking
- Immutable audit trail with actor/request metadata
- OIDC best-practice token and state/nonce validation
- Rate limiting and input validation
- Secure cookie/session policy
- Malware scan adapter and strict file validation
- Signed short-lived object URLs
- Secret redaction in logs
- CI dependency/container/security scanning

## Residual risks to close in later phases

- End-to-end stakeholder isolation test coverage
- Policy engine formalization and policy simulation tooling
- Automated secret rotation workflows
- Full backup encryption and off-site rotation policies
- OpenTelemetry pipeline hardening and alert tuning
