# Security Model

## Model summary

- AuthN via Microsoft Entra OIDC
- AuthZ via RBAC + record-level checks
- Immutable audit events for privileged operations
- Object storage access through signed short-lived URLs
- Secret redaction and sensitive field protection

## Controls baseline

- Secure transport (TLS)
- Input validation
- Rate limiting
- CSP and secure headers
- CSRF/session controls (where applicable)
- Webhook signature verification
