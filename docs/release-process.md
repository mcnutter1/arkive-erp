# Release Process

1. Create release branch or tag candidate.
2. Run CI checks: lint, typecheck, tests, build, security scans.
3. Produce release notes with migration and risk callouts.
4. Obtain owner approval.
5. Deploy via `scripts/update.sh <tag>`.
6. Validate smoke and health checks.
7. Record deployment result and retention of backup artifact.
