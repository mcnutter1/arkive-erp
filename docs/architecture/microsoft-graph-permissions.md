# Microsoft Graph Permissions Proposal

## Scope principles

- Request least privilege
- Prefer delegated permissions when feasible
- Use application permissions only for unattended provisioning/deprovisioning jobs
- Document purpose and owning workflow for every permission

## Candidate permissions (initial)

- `User.Read.All` (application): reconcile account identity and status
- `User.ReadWrite.All` (application): create/update user accounts for approved jobs
- `Group.Read.All` (application): reconcile configured group mappings
- `Group.ReadWrite.All` (application): assign/remove group membership in approved workflows
- `Directory.Read.All` (application): directory validation and drift detection
- `Organization.Read.All` (application): tenant metadata and verified domain validation

## Conditional permissions (approval required)

- `Directory.AccessAsUser.All` (delegated): only if delegated admin console actions are required
- `TeamMember.ReadWrite.All` (application): if Teams membership provisioning is enabled

## Security requirements

- Store credentials in secrets manager or encrypted environment variables
- Rotate credentials/certificates periodically
- Use dry-run mode and approval gates for destructive actions
- Log Graph request IDs and outcomes without logging tokens or secrets
