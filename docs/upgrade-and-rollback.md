# Upgrade and Rollback Guide

## Upgrade

Run:

```bash
scripts/update.sh <release-tag>
```

Behavior:

- Requires explicit tag
- Blocks dirty working tree unless override set
- Acquires deployment lock
- Runs pre-deploy backup
- Rebuilds containers and runs migration
- Runs health checks

## Rollback

Run:

```bash
scripts/rollback.sh <release-tag>
```

Note: database schema rollback may require restoring from backup if migration is not backward compatible.
